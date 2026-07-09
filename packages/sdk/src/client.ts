import { stream as dsStream } from '@durable-streams/client';
import { HttpClient, type HttpClientOptions, type RequestHeaders } from './http.ts';

export type { HttpClientOptions } from './http.ts';

import type {
	BapxConversationHistoryOptions,
	BapxConversationMessage,
	BapxConversationSnapshot,
} from './public/conversation.ts';
import {
	type ConversationStreamChunk,
	assertConversationStreamChunk,
} from './public/conversation-stream.ts';
import {
	createAgentConversationObservation,
	type AgentConversationObservation,
	type AgentConversationObserveOptions,
} from './public/observe.ts';
import {
	type AgentPromptOptions,
	type AgentSendResult,
	sendAgent,
} from './public/invoke.ts';
import {
	type AgentWaitOptions,
	runWorkflow,
	type WorkflowRunOptions,
	type WorkflowRunResult,
	waitForAgentSubmission,
} from './public/settle.ts';
import {
	createBapxEventStream,
	type BapxEventStream,
	type BapxStreamOptions,
} from './public/stream.ts';
import type {
	BapxEvent,
	RunRecord,
} from './types.ts';

export type { RequestHeaders };

/** Options for starting a workflow run. */
export interface WorkflowInvokeOptions {
	/** Workflow-defined input. */
	input?: unknown;
	/**
	 * When `'result'`, the request waits for the run to finish and resolves
	 * with its terminal result. Omit to start the run without waiting.
	 */
	wait?: 'result';
	signal?: AbortSignal;
}

/** Result of starting a workflow run. */
export interface WorkflowInvokeResult {
	/** The workflow run ID. */
	runId: string;
}

/** Result of one workflow invocation that waited for the terminal result. */
export interface WorkflowWaitResult extends WorkflowInvokeResult {
	/** Terminal result of the workflow run. */
	result: unknown;
}

/** Options for one catch-up read of workflow-run events (no live tailing). */
export type RunEventsOptions = Omit<BapxStreamOptions, 'live'>;

/** Result of aborting an agent instance's durable work. */
export interface AgentAbortResult {
	/**
	 * `true` when there was in-flight or queued work that is now being aborted;
	 * `false` when the instance was idle (nothing to abort). Terminal settlement
	 * (the distinct aborted outcome) happens asynchronously — observe it via
	 * `wait()` (which rejects with the submission_aborted error), `observe()`, or
	 * `history()`.
	 */
	aborted: boolean;
}

/** Options for creating a client for deployed Bapx application routes. */
export type CreateBapxClientOptions = HttpClientOptions;

/** Client for invoking deployed agents and workflows and inspecting workflow runs. */
export interface BapxClient {
	/** Direct interactions with persistent agent instances. */
	agents: {
		/** Starts one message delivery without waiting for completion. */
		send(name: string, id: string, options: AgentPromptOptions): Promise<AgentSendResult>;
		/**
		 * Awaits the admitted submission's completion. Resolves void when it
		 * settles completed and throws `BapxExecutionError` when it settles
		 * failed or aborted. The agent's reply is not returned here — read it
		 * from the conversation via `onEvent` chunks, `observe()`, or `history()`.
		 */
		wait(admission: AgentSendResult, options?: AgentWaitOptions): Promise<void>;
		/**
		 * Aborts all in-flight and queued durable work for an agent instance
		 * (the agent's currently running submission and any queued behind it).
		 * Resolves once the abort intent is recorded; the work settles to the
		 * distinct aborted outcome asynchronously.
		 */
		abort(
			name: string,
			id: string,
			options?: { signal?: AbortSignal },
		): Promise<AgentAbortResult>;
		/** Reads one materialized conversation snapshot for the agent instance. */
		history(
			name: string,
			id: string,
			options?: BapxConversationHistoryOptions,
		): Promise<BapxConversationSnapshot>;
		/** Observes one materialized conversation across history catch-up and live updates. */
		observe(
			name: string,
			id: string,
			options?: AgentConversationObserveOptions,
		): AgentConversationObservation;
		/**
		 * Absolute URL for one `file` part's attachment bytes, suitable as an
		 * `<img>`/`<a>` source. The download endpoint is opt-in per agent (via the
		 * agent module's `attachments` middleware export); without it the URL
		 * returns 404.
		 */
		attachmentUrl(name: string, id: string, attachmentId: string): string;
	};
	/** Workflow-run inspection and streaming APIs. */
	runs: {
		/** Retrieves one workflow-run record via the `?meta` view of the run route. */
		get(runId: string): Promise<RunRecord>;
		/** Stream events from a workflow run via the Durable Streams protocol. */
		stream(runId: string, options?: BapxStreamOptions): BapxEventStream<BapxEvent>;
		/** Get all events from a workflow run as an array (catch-up read, no live tailing). */
		events(runId: string, options?: RunEventsOptions): Promise<BapxEvent[]>;
	};
	/** Start workflow runs. */
	workflows: {
		/** Run a workflow to completion and resolve with its terminal result. */
		invoke(
			name: string,
			options: WorkflowInvokeOptions & { wait: 'result' },
		): Promise<WorkflowWaitResult>;
		/** Start a workflow run and return its ID. */
		invoke(name: string, options?: WorkflowInvokeOptions): Promise<WorkflowInvokeResult>;
		run<TResult = unknown>(
			name: string,
			options?: WorkflowRunOptions,
		): Promise<WorkflowRunResult<TResult>>;
	};
}

// The runtime can't know the HTTP mount/baseUrl, so the SDK resolves a ready-to-
// use `url` onto each durably-recorded `file` part (those with an `id`). This
// lets consumers read `part.url` directly instead of constructing it via
// `attachmentUrl`. Optimistic parts (no `id`) carry their own `data:` preview and
// are left untouched.
function withAttachmentUrls(
	message: BapxConversationMessage,
	http: HttpClient,
	name: string,
	id: string,
): BapxConversationMessage {
	let changed = false;
	const parts = message.parts.map((part) => {
		if (part.type === 'file' && part.id !== undefined && part.url === undefined) {
			changed = true;
			return {
				...part,
				url: http.url(
					`/agents/${encodeURIComponent(name)}/${encodeURIComponent(id)}/attachments/${encodeURIComponent(part.id)}`,
				),
			};
		}
		return part;
	});
	return changed ? { ...message, parts } : message;
}

function rewriteSnapshotAttachmentUrls(
	snapshot: BapxConversationSnapshot,
	http: HttpClient,
	name: string,
	id: string,
): BapxConversationSnapshot {
	return { ...snapshot, messages: snapshot.messages.map((message) => withAttachmentUrls(message, http, name, id)) };
}

function rewriteChunkAttachmentUrls(
	chunk: ConversationStreamChunk,
	http: HttpClient,
	name: string,
	id: string,
): ConversationStreamChunk {
	if (chunk.type === 'conversation-reset') {
		return { ...chunk, snapshot: rewriteSnapshotAttachmentUrls(chunk.snapshot, http, name, id) };
	}
	if (chunk.type === 'message-appended') {
		return { ...chunk, message: withAttachmentUrls(chunk.message, http, name, id) };
	}
	return chunk;
}

/** Creates a client for the public routes of a deployed Bapx application. */
export function createBapxClient(options: CreateBapxClientOptions): BapxClient {
	const http = new HttpClient(options);
	return {
		agents: {
			send: (name, id, opts) => sendAgent(http, name, id, opts),
			wait: (admission, opts) => waitForAgentSubmission(http, admission, opts),
			abort: (name, id, opts = {}) =>
				http.json<AgentAbortResult>({
					method: 'POST',
					path: `/agents/${encodeURIComponent(name)}/${encodeURIComponent(id)}/abort`,
					signal: opts.signal,
				}),
			history: async (name, id, opts = {}) =>
				rewriteSnapshotAttachmentUrls(
					await http.json<BapxConversationSnapshot>({
						path: `/agents/${encodeURIComponent(name)}/${encodeURIComponent(id)}`,
						query: { view: 'history' },
						signal: opts.signal,
					}),
					http,
					name,
					id,
				),
			observe: (name, id, opts = {}) =>
				createAgentConversationObservation(
					{
						history: async (historyOptions) =>
							rewriteSnapshotAttachmentUrls(
								await http.json<BapxConversationSnapshot>({
									path: `/agents/${encodeURIComponent(name)}/${encodeURIComponent(id)}`,
									query: { view: 'history' },
									signal: historyOptions.signal,
								}),
								http,
								name,
								id,
							),
						updates: (updateOptions) =>
							createBapxEventStream<ConversationStreamChunk>(
								updateOptions,
								{
									url: http.url(`/agents/${encodeURIComponent(name)}/${encodeURIComponent(id)}`, {
										view: 'updates',
									}),
									fetch: http.fetchWithHeaders.bind(http),
								},
								(chunk) =>
									rewriteChunkAttachmentUrls(assertConversationStreamChunk(chunk), http, name, id),
							),
					},
					opts,
				),
			attachmentUrl: (name, id, attachmentId) =>
				http.url(
					`/agents/${encodeURIComponent(name)}/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachmentId)}`,
				),
		},
		runs: {
			get: (runId) => http.json<RunRecord>({ path: `/runs/${encodeURIComponent(runId)}?meta` }),
			stream: (runId, opts = {}) =>
				createBapxEventStream<BapxEvent>(opts, {
					url: http.url(`/runs/${encodeURIComponent(runId)}`),
					fetch: http.fetchWithHeaders.bind(http),
				}),
			events: async (runId, opts) => {
				const url = new URL(http.url(`/runs/${encodeURIComponent(runId)}`));
				if (opts?.tail !== undefined) url.searchParams.set('tail', String(opts.tail));
				const events: BapxEvent[] = [];
				let offset = opts?.offset ?? '-1';
				// The DS client makes exactly one request per `live: false` stream,
				// even when the server caps the catch-up batch and reports more data
				// remains (no Stream-Up-To-Date header). Loop until up-to-date.
				for (;;) {
					const res = await dsStream<BapxEvent>({
						url: url.toString(),
						offset,
						live: false,
						json: true,
						signal: opts?.signal,
						backoffOptions: opts?.backoffOptions,
						fetch: http.fetchWithHeaders.bind(http),
						warnOnHttp: false,
					});
					events.push(...(await readJsonWithAbort<BapxEvent[]>(res, opts?.signal)));
					if (res.upToDate || res.offset === offset) break;
					offset = res.offset;
				}
				return events;
			},
		},
		workflows: {
			invoke: (name, opts?: WorkflowInvokeOptions) =>
				http.json<WorkflowWaitResult>({
					method: 'POST',
					path: `/workflows/${encodeURIComponent(name)}`,
					query: opts?.wait === 'result' ? { wait: 'result' } : undefined,
					body: opts?.input,
					signal: opts?.signal,
				}),
			run: (name, opts) => runWorkflow(http, name, opts),
		},
	};
}

async function readJsonWithAbort<T>(
	response: { json(): Promise<T> },
	signal?: AbortSignal,
): Promise<T> {
	const result = await response.json();
	if (signal?.aborted) {
		throw signal.reason ?? new DOMException('Aborted', 'AbortError');
	}
	return result;
}
