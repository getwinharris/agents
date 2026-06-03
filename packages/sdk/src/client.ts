import { HttpClient, type HttpClientOptions, type RequestHeaders } from './http.ts';
import {
	type AgentInvokeOptions,
	type AgentStreamInvokeOptions,
	type AgentSyncInvokeOptions,
	invokeAgent,
	type SyncInvokeResult,
} from './public/invoke.ts';
import { type RunStreamOptions, streamRunEvents } from './public/stream.ts';
import {
	type AgentSocket,
	connectAgentSocket,
	connectWorkflowSocket,
	defaultWebSocketFactory,
	type WebSocketFactory,
	type WebSocketTarget,
	type WebSocketUrlTransform,
	type WorkflowSocket,
	webSocketUrl,
} from './public/websocket.ts';
import type {
	AgentManifestEntry,
	AttachedAgentEvent,
	FlueEvent,
	ListResponse,
	RunPointer,
	RunRecord,
	RunStatus,
} from './types.ts';

export type { RequestHeaders };

/** Options for retrieving recorded workflow-run events. */
export interface RunEventsOptions {
	/** Return events strictly after this event index. */
	after?: number;
	/** Select event types. */
	types?: string[];
	/** Maximum number of events to return. Defaults to `100`; accepts `1..1000`. */
	limit?: number;
}

/** Options for listing workflow-run summaries. */
export interface ListRunsOptions {
	cursor?: string;
	/** Maximum number of runs to return. Accepts `1..1000`. */
	limit?: number;
	status?: RunStatus;
	workflowName?: string;
}

/** Options for creating a client for deployed Flue application routes. */
export interface CreateFlueClientOptions extends HttpClientOptions {
	/** Origin-relative mount path for read-only admin routes. Defaults to `/admin`. */
	adminBasePath?: string;
	/** Custom WebSocket implementation. Defaults to the global `WebSocket` constructor. */
	websocket?: WebSocketFactory;
	/** Transforms each WebSocket URL after HTTP protocol conversion, for example to add handshake authentication. */
	websocketUrl?: WebSocketUrlTransform;
}

/** Client for invoking deployed agents and workflows and inspecting workflow runs. */
export interface FlueClient {
	/** Workflow-run inspection APIs. Direct agent interactions and dispatched agent inputs are not runs. */
	runs: {
		/** Retrieves one workflow-run record. */
		get(runId: string): Promise<RunRecord>;
		/** Retrieves recorded workflow-run events. */
		events(runId: string, options?: RunEventsOptions): Promise<{ events: FlueEvent[] }>;
		/** Streams workflow-run events until `run_end`, cancellation, or an unrecoverable error. */
		stream(
			runId: string,
			options?: RunStreamOptions,
		): AsyncIterable<import('./types.ts').FlueEvent>;
	};
	/** Direct interactions with persistent agent instances. */
	agents: {
		/** Streams events for one agent prompt. */
		invoke(
			name: string,
			id: string,
			options: AgentStreamInvokeOptions,
		): AsyncIterable<AttachedAgentEvent>;
		/** Resolves the terminal result for one agent prompt. */
		invoke(name: string, id: string, options: AgentSyncInvokeOptions): Promise<SyncInvokeResult>;
		/** Sends one direct-agent prompt using either invocation mode. */
		invoke(
			name: string,
			id: string,
			options: AgentInvokeOptions,
		): Promise<SyncInvokeResult> | AsyncIterable<AttachedAgentEvent>;
		/** Opens a reusable WebSocket connection to an agent instance. */
		connect(name: string, id: string): AgentSocket;
	};
	/** Workflow invocation APIs. */
	workflows: {
		/** Opens a WebSocket connection for one workflow invocation. */
		connect(name: string): WorkflowSocket;
	};
	/** Read-only APIs exposed by the configured admin mount path. */
	admin: {
		agents: {
			/** Lists all built agents and their transport metadata. */
			list(): Promise<{ items: AgentManifestEntry[] }>;
		};
		runs: {
			/** Lists workflow-run summaries. */
			list(options?: ListRunsOptions): Promise<ListResponse<RunPointer>>;
			/** Retrieves one workflow-run record from the admin mount path. */
			get(runId: string): Promise<RunRecord>;
		};
	};
}

/** Creates a client for the public and read-only admin routes of a deployed Flue application. */
export function createFlueClient(options: CreateFlueClientOptions): FlueClient {
	const http = new HttpClient(options);
	const websocket = options.websocket ?? defaultWebSocketFactory;
	const websocketEndpoint = createWebSocketEndpoint(http, options.websocketUrl);
	const adminBasePath = normalizeBasePath(options.adminBasePath ?? '/admin');
	const adminHttp = new HttpClient({
		...options,
		baseUrl: new URL(`${adminBasePath}/`, http.baseUrl).toString(),
	});
	return {
		runs: {
			get: (runId) => http.json({ path: `/runs/${encodeURIComponent(runId)}` }),
			events: (runId, opts = {}) =>
				http.json({
					path: `/runs/${encodeURIComponent(runId)}/events`,
					query: { after: opts.after, types: opts.types?.join(','), limit: opts.limit },
				}),
			stream: (runId, opts) => streamRunEvents(http, runId, opts),
		},
		agents: {
			invoke: ((name: string, id: string, opts: Parameters<typeof invokeAgent>[3]) =>
				invokeAgent(http, name, id, opts)) as FlueClient['agents']['invoke'],
			connect: (name, id) =>
				connectAgentSocket(
					websocket,
					websocketEndpoint(`/agents/${encodeURIComponent(name)}/${encodeURIComponent(id)}`, {
						target: 'agent',
						name,
						instanceId: id,
					}),
					name,
					id,
				),
		},
		workflows: {
			connect: (name) =>
				connectWorkflowSocket(
					websocket,
					websocketEndpoint(`/workflows/${encodeURIComponent(name)}`, { target: 'workflow', name }),
					name,
				),
		},
		admin: {
			agents: {
				list: () => adminHttp.json({ path: '/agents' }),
			},
			runs: {
				list: (opts = {}) => adminHttp.json({ path: '/runs', query: runsQuery(opts) }),
				get: (runId) => adminHttp.json({ path: `/runs/${encodeURIComponent(runId)}` }),
			},
		},
	};
}

function normalizeBasePath(path: string): string {
	const trimmed = path.trim();
	if (!trimmed || trimmed === '/') return '';
	return `/${trimmed.replace(/^\/+|\/+$/g, '')}`;
}

function createWebSocketEndpoint(http: HttpClient, transform: WebSocketUrlTransform | undefined) {
	return (path: string, target: WebSocketTarget): string => {
		const url = new URL(webSocketUrl(http.url(path)));
		return String(transform?.(url, target) ?? url);
	};
}

function runsQuery(opts: ListRunsOptions): Record<string, string | number | undefined> {
	return {
		cursor: opts.cursor,
		limit: opts.limit,
		status: opts.status,
		workflowName: opts.workflowName,
	};
}
