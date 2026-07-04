import { AsyncLocalStorage } from 'node:async_hooks';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentExecutionStore } from '../src/agent-execution-store.ts';
import type { FlueContextInternal } from '../src/client.ts';
import { createCloudflareAgentRuntime } from '../src/cloudflare/agent-coordinator.ts';
import type {
	AgentSubmissionInspection,
	AgentSubmissionInterruption,
	AgentSubmissionInput,
} from '../src/runtime/agent-submissions.ts';

afterEach(() => {
	vi.restoreAllMocks();
});

function queryExpectsRows(query: string): boolean {
	const trimmed = query.trimStart().toUpperCase();
	if (trimmed.startsWith('SELECT') || trimmed.startsWith('WITH')) return true;
	if (/\bRETURNING\b/i.test(query)) return true;
	return false;
}

function makeFakeSql() {
	const db = new DatabaseSync(':memory:');
	return {
		db,
		storage: {
			sql: {
				exec(query: string, ...bindings: unknown[]) {
					const stmt = db.prepare(query);
					let rows: unknown[];
					if (queryExpectsRows(query)) {
						rows = stmt.all(...(bindings as never[]));
					} else {
						stmt.run(...(bindings as never[]));
						rows = [];
					}
					return {
						toArray() {
							return rows as Record<string, unknown>[];
						},
					};
				},
			},
			transactionSync<T>(closure: () => T): T {
				db.exec('BEGIN');
				try {
					const result = closure();
					db.exec('COMMIT');
					return result;
				} catch (error) {
					db.exec('ROLLBACK');
					throw error;
				}
			},
		},
	};
}

function makeRuntime(
	options: {
		createdAgent?: Parameters<typeof createCloudflareAgentRuntime>[0]['agents'][number]['definition'];
		createContext?: Parameters<typeof createCloudflareAgentRuntime>[0]['createContext'];
	} = {},
) {
	return createCloudflareAgentRuntime({
		agents: options.createdAgent
			? [{ name: 'assistant', definition: options.createdAgent }]
			: [],
		createContext:
			options.createContext ??
			(() => {
				throw new Error('Unexpected context creation.');
			}),
		runWithInstanceContext(_instance, _agentName, callback) {
			return callback();
		},
	});
}

function makeInstance(storage: ReturnType<typeof makeFakeSql>['storage'], events: string[] = []) {
	return {
		name: 'agent-1',
		env: {},
		ctx: {
			id: { toString: () => 'do-1' },
			storage,
		},
		async __unsafe_ensureInitialized() {},
		async schedule(
			_delaySeconds: number,
			_callback: string,
			_payload: undefined,
			options: { idempotent: boolean },
		) {
			events.push(options.idempotent ? 'schedule-idempotent' : 'schedule-successor');
		},
		async runFiber(
			_name: string,
			_callback: (ctx: { stash(snapshot: unknown): void }) => Promise<void>,
		) {},
	};
}

function makeRecoveryContext(options: {
	inspection?: AgentSubmissionInspection;
	events?: string[];
}) {
	const terminalRecords: AgentSubmissionInterruption[] = [];
	const session = {
		processSubmissionInput() {
			throw new Error('Unexpected submission processing.');
		},
		inspectSubmissionInput() {
			return options.inspection ?? 'uncertain';
		},
		async recordSubmissionTerminal(input: AgentSubmissionInterruption) {
			options.events?.push('record-terminal');
			terminalRecords.push(input);
			return [];
		},
	};
	const ctx = {
		async initializeRootHarness() {
			return {
				async session() {
					return session;
				},
			};
		},
		createEvent(event: unknown) {
			return event;
		},
		publishEvent() {},
		emitEvent(event: unknown) {
			return event;
		},
		async flushEventCallbacks() {},
		subscribeEvent() {
			return () => {};
		},
	} as unknown as FlueContextInternal;
	return { ctx, terminalRecords };
}

function directInput(
	overrides: Partial<AgentSubmissionInput> = {},
): AgentSubmissionInput {
	return {
		kind: 'direct',
		submissionId: 'direct-1',
		agent: 'assistant',
		id: 'agent-1',
		message: { kind: 'user', body: 'Hello' },
		acceptedAt: '2026-06-03T00:00:00.000Z',
		...overrides,
	};
}

function dispatchInput() {
	return {
		dispatchId: 'dispatch-1',
		agent: 'assistant',
		id: 'agent-1',
		message: { kind: 'signal' as const, type: 'test.event', body: 'Hello' },
		acceptedAt: '2026-06-03T00:00:00.000Z',
	};
}

function prepare(
	runtime: ReturnType<typeof makeRuntime>,
	instance: ReturnType<typeof makeInstance>,
): AgentExecutionStore {
	const prepared = runtime.prepare({
		storage: instance.ctx.storage,
		className: 'FlueAssistantAgent',
		agentName: 'assistant',
	});
	runtime.attach(instance, prepared);
	return prepared.executionStore;
}

describe('createCloudflareAgentRuntime()', () => {
	it('materializes an admitted submission whose canonical readiness was not marked', async () => {
		const { storage } = makeFakeSql();
		const recovery = makeRecoveryContext({ inspection: 'absent' });
		const runtime = makeRuntime({
			createdAgent: {} as never,
			createContext: () => recovery.ctx,
		});
		const instance = makeInstance(storage);
		const executionStore = prepare(runtime, instance);
		await executionStore.submissions.admitDirect(directInput());

		await runtime.onStart(instance, () => {});

		expect(await executionStore.submissions.getSubmission('direct-1')).toMatchObject({
			status: 'running',
			canonicalReadyAt: expect.any(Number),
		});
	});

	it('recovers on the same coordinator after writer creation fails', async () => {
		const { storage } = makeFakeSql();
		const recovery = makeRecoveryContext({ inspection: 'absent' });
		const runtime = makeRuntime({
			createdAgent: {} as never,
			createContext: () => recovery.ctx,
		});
		const instance = makeInstance(storage);
		const prepared = runtime.prepare({
			storage: instance.ctx.storage,
			className: 'FlueAssistantAgent',
			agentName: 'assistant',
		});
		const acquireProducer = prepared.conversationStreamStore.acquireProducer.bind(
			prepared.conversationStreamStore,
		);
		let failCreation = true;
		prepared.conversationStreamStore.acquireProducer = async (...args) => {
			if (failCreation) {
				failCreation = false;
				throw new Error('transient writer creation failure');
			}
			return acquireProducer(...args);
		};
		runtime.attach(instance, prepared);
		await prepared.executionStore.submissions.admitDirect(directInput());
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

		await runtime.onStart(instance, () => {});
		await runtime.onStart(instance, () => {});

		expect(consoleError).toHaveBeenCalledWith(
			'[flue:submission-reconciliation]',
			expect.objectContaining({ operation: 'materialize_submission' }),
			expect.any(Error),
		);
		expect(await prepared.executionStore.submissions.getSubmission('direct-1')).toMatchObject({
			canonicalReadyAt: expect.any(Number),
		});
	});

	it('restores a pending wake before inherited startup when unsettled work exists', async () => {
		const events: string[] = [];
		const { storage } = makeFakeSql();
		const runtime = makeRuntime();
		const instance = makeInstance(storage, events);
		const executionStore = prepare(runtime, instance);
		await executionStore.submissions.admitDirect(directInput());

		await runtime.onStart(instance, () => {
			events.push('inherited-start');
		});

		expect(events.slice(0, 2)).toEqual(['schedule-idempotent', 'inherited-start']);
	});

	it('arms a fresh non-idempotent successor before scheduled reconciliation', async () => {
		const events: string[] = [];
		const { storage } = makeFakeSql();
		const runtime = makeRuntime();
		const instance = makeInstance(storage, events);
		const executionStore = prepare(runtime, instance);
		await executionStore.submissions.admitDirect(directInput());

		await runtime.wakeSubmissions(instance);

		expect(events[0]).toBe('schedule-successor');
	});

	it('restores a wake before recording recovered raw Fiber ownership', async () => {
		const events: string[] = [];
		const { storage } = makeFakeSql();
		const runtime = makeRuntime();
		const instance = makeInstance(storage, events);
		const executionStore = prepare(runtime, instance);
		const originalRequestRecovery = executionStore.submissions.requestSubmissionRecovery.bind(
			executionStore.submissions,
		);
		executionStore.submissions.requestSubmissionRecovery = async (attempt) => {
			events.push('request-recovery');
			return originalRequestRecovery(attempt);
		};
		await executionStore.submissions.admitDirect(directInput());
		await executionStore.submissions.markSubmissionCanonicalReady('direct-1');
		await executionStore.submissions.claimSubmission({
			submissionId: 'direct-1',
			attemptId: 'attempt-1',
			ownerId: 'test-owner',
			leaseExpiresAt: Date.now() + 30_000,
		});

		await runtime.onFiberRecovered(
			instance,
			{
				name: 'flue:submission-attempt',
				snapshot: { submissionId: 'direct-1', attemptId: 'attempt-1' },
			},
			() => {},
		);

		expect(events).toEqual(['schedule-idempotent', 'request-recovery']);
	});

	it('skips interrupted-attempt reconciliation while a fresh attempt marker covers the running attempt', async () => {
		const events: string[] = [];
		const { storage } = makeFakeSql();
		const recovery = makeRecoveryContext({ inspection: 'absent' });
		const runtime = makeRuntime({
			createdAgent: {} as never,
			createContext: () => recovery.ctx,
		});
		const instance = makeInstance(storage);
		const executionStore = prepare(runtime, instance);
		const originalRequeue = executionStore.submissions.requeueSubmissionBeforeInputApplied.bind(
			executionStore.submissions,
		);
		executionStore.submissions.requeueSubmissionBeforeInputApplied = async (attempt) => {
			events.push('requeue');
			return originalRequeue(attempt);
		};
		await executionStore.submissions.admitDirect(directInput());
		await executionStore.submissions.markSubmissionCanonicalReady('direct-1');
		await executionStore.submissions.claimSubmission({
			submissionId: 'direct-1',
			attemptId: 'attempt-1',
			ownerId: 'test-owner',
			leaseExpiresAt: Date.now() + 30_000,
		});
		await executionStore.submissions.insertAttemptMarker({
			submissionId: 'direct-1',
			attemptId: 'attempt-1',
		});

		await runtime.onStart(instance, () => {});

		expect(events).not.toContain('requeue');
		expect(await executionStore.submissions.getSubmission('direct-1')).toMatchObject({
			status: 'running',
			attemptId: 'attempt-1',
		});
	});

	it('reconciles running attempts when the attempt marker is stale', async () => {
		const events: string[] = [];
		const { db, storage } = makeFakeSql();
		const recovery = makeRecoveryContext({ inspection: 'absent' });
		const runtime = makeRuntime({
			createdAgent: {} as never,
			createContext: () => recovery.ctx,
		});
		const instance = makeInstance(storage);
		const executionStore = prepare(runtime, instance);
		const originalRequeue = executionStore.submissions.requeueSubmissionBeforeInputApplied.bind(
			executionStore.submissions,
		);
		executionStore.submissions.requeueSubmissionBeforeInputApplied = async (attempt) => {
			events.push('requeue');
			return originalRequeue(attempt);
		};
		await executionStore.submissions.admitDirect(directInput());
		await executionStore.submissions.markSubmissionCanonicalReady('direct-1');
		await executionStore.submissions.claimSubmission({
			submissionId: 'direct-1',
			attemptId: 'attempt-1',
			ownerId: 'test-owner',
			leaseExpiresAt: Date.now() + 30_000,
		});
		db.prepare(
			'INSERT INTO flue_agent_attempt_markers (submission_id, attempt_id, created_at) VALUES (?, ?, ?)',
		).run('direct-1', 'attempt-1', Date.now() - 16 * 60 * 1000);

		await runtime.onStart(instance, () => {});

		expect(events).toContain('requeue');
		expect(await executionStore.submissions.getSubmission('direct-1')).toMatchObject({
			status: 'running',
		});
	});

	it('degrades to an empty marker set when the marker scan fails so queued submissions remain claimable', async () => {
		const { db, storage } = makeFakeSql();
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const runtime = makeRuntime();
		const instance = makeInstance(storage);
		const executionStore = prepare(runtime, instance);
		db.exec('DROP TABLE flue_agent_attempt_markers');
		await executionStore.submissions.admitDirect(directInput());
		await executionStore.submissions.markSubmissionCanonicalReady('direct-1');

		await runtime.onStart(instance, () => {});

		expect(await executionStore.submissions.getSubmission('direct-1')).toMatchObject({
			status: 'running',
		});
		expect(consoleError).toHaveBeenCalledWith(
			'[flue:submission-reconciliation]',
			expect.objectContaining({
				operation: 'list_attempt_markers',
				outcome: 'degraded_to_empty_marker_set',
			}),
			expect.any(Error),
		);
	});

	it('requeues interrupted attempts when canonical input is absent', async () => {
		const events: string[] = [];
		const { storage } = makeFakeSql();
		const recovery = makeRecoveryContext({ inspection: 'absent' });
		const runtime = makeRuntime({
			createdAgent: {} as never,
			createContext: () => recovery.ctx,
		});
		const instance = makeInstance(storage);
		const executionStore = prepare(runtime, instance);
		const originalRequeue = executionStore.submissions.requeueSubmissionBeforeInputApplied.bind(
			executionStore.submissions,
		);
		executionStore.submissions.requeueSubmissionBeforeInputApplied = async (attempt) => {
			events.push('requeue');
			return originalRequeue(attempt);
		};
		await executionStore.submissions.admitDirect(directInput());
		await executionStore.submissions.markSubmissionCanonicalReady('direct-1');
		await executionStore.submissions.claimSubmission({
			submissionId: 'direct-1',
			attemptId: 'attempt-1',
			ownerId: 'test-owner',
			leaseExpiresAt: Date.now() + 30_000,
		});

		await runtime.onStart(instance, () => {});

		expect(events).toContain('requeue');
		expect(await executionStore.submissions.getSubmission('direct-1')).toMatchObject({
			status: 'running',
		});
	});

	it('claims queued submissions when another attempt fails to start synchronously', async () => {
		const { storage } = makeFakeSql();
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		let startCalls = 0;
		const runtime = makeRuntime();
		const instance = makeInstance(storage);
		instance.runFiber = (_name, _callback) => {
			startCalls += 1;
			if (startCalls === 1) throw new Error('Fiber startup failed');
			return new Promise<void>(() => {});
		};
		const executionStore = prepare(runtime, instance);
		await executionStore.submissions.admitDirect(directInput());
		await executionStore.submissions.markSubmissionCanonicalReady('direct-1');

		await runtime.onStart(instance, () => {});

		expect(startCalls).toBe(1);
		expect(await executionStore.submissions.getSubmission('direct-1')).toMatchObject({
			status: 'running',
		});
		expect(consoleError).toHaveBeenCalledWith(
			'[flue:submission-reconciliation]',
			expect.objectContaining({
				submissionId: 'direct-1',
				operation: 'start_submission',
				outcome: 'deferred_to_scheduled_wake',
			}),
			expect.any(Error),
		);
	});

	it('retries a synchronously failed attempt on a later wake when canonical input is absent', async () => {
		const events: string[] = [];
		const { storage } = makeFakeSql();
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const recovery = makeRecoveryContext({ inspection: 'absent' });
		let startCalls = 0;
		const runtime = makeRuntime({
			createdAgent: {} as never,
			createContext: () => recovery.ctx,
		});
		const instance = makeInstance(storage);
		instance.runFiber = (_name, _callback) => {
			startCalls += 1;
			if (startCalls === 1) throw new Error('Fiber startup failed');
			return new Promise<void>(() => {});
		};
		const executionStore = prepare(runtime, instance);
		const originalRequeue = executionStore.submissions.requeueSubmissionBeforeInputApplied.bind(
			executionStore.submissions,
		);
		executionStore.submissions.requeueSubmissionBeforeInputApplied = async (attempt) => {
			events.push('requeue');
			return originalRequeue(attempt);
		};
		await executionStore.submissions.admitDirect(directInput());

		await runtime.onStart(instance, () => {});
		const failedAttempt = (await executionStore.submissions.getSubmission('direct-1'))?.attemptId;
		await runtime.wakeSubmissions(instance);

		expect(startCalls).toBe(2);
		expect(events).toContain('requeue');
		expect(await executionStore.submissions.getSubmission('direct-1')).toMatchObject({
			status: 'running',
			attemptId: expect.any(String),
		});
		expect((await executionStore.submissions.getSubmission('direct-1'))?.attemptId).not.toBe(
			failedAttempt,
		);
	});

	it('delivers the persisted dispatch submission through the session when processing', async () => {
		const { storage } = makeFakeSql();
		const processedInputs: unknown[] = [];
		let resolveProcessed!: () => void;
		const processed = new Promise<void>((resolve) => {
			resolveProcessed = resolve;
		});
		const session = {
			async processSubmissionInput(input: unknown) {
				processedInputs.push(input);
				resolveProcessed();
			},
			async recordSubmissionTerminal() {
				return [];
			},
		};
		const runtime = makeRuntime({
			createdAgent: {} as never,
			createContext: () => {
				return {
					async initializeRootHarness() {
						return {
							async session() {
								return session;
							},
						};
					},
					setEventCallback() {},
					createEvent(event: unknown) {
						return event;
					},
					publishEvent() {},
					emitEvent(event: unknown) {
						return event;
					},
					async flushEventCallbacks() {},
					subscribeEvent() {
						return () => {};
					},
				} as unknown as FlueContextInternal;
			},
		});
		const instance = makeInstance(storage);
		instance.runFiber = async (_name, callback) => callback({ stash() {} });
		const executionStore = prepare(runtime, instance);
		await executionStore.submissions.admitDispatch(dispatchInput());

		await runtime.onStart(instance, () => {});
		await processed;

		expect(processedInputs).toEqual([
			{
				kind: 'dispatch',
				submissionId: 'dispatch-1',
				agent: 'assistant',
				id: 'agent-1',
				message: { kind: 'signal', type: 'test.event', body: 'Hello' },
				acceptedAt: '2026-06-03T00:00:00.000Z',
			},
		]);
	});

	it('settles recovered dispatch input without context payload plumbing', async () => {
		const { storage } = makeFakeSql();
		const recovery = makeRecoveryContext({ inspection: 'completed' });
		let contextCount = 0;
		const runtime = makeRuntime({
			createdAgent: {} as never,
			createContext: () => {
				contextCount += 1;
				return recovery.ctx;
			},
		});
		const instance = makeInstance(storage);
		const executionStore = prepare(runtime, instance);
		await executionStore.submissions.admitDispatch(dispatchInput());
		await executionStore.submissions.markSubmissionCanonicalReady('dispatch-1');
		await executionStore.submissions.claimSubmission({
			submissionId: 'dispatch-1',
			attemptId: 'attempt-1',
			ownerId: 'test-owner',
			leaseExpiresAt: Date.now() + 30_000,
		});
		await executionStore.submissions.markSubmissionInputApplied({
			submissionId: 'dispatch-1',
			attemptId: 'attempt-1',
		});

		await runtime.onStart(instance, () => {});

		expect(contextCount).toBe(1);
		expect(await executionStore.submissions.getSubmission('dispatch-1')).toMatchObject({
			status: 'settled',
		});
	});

	it('routes POST /abort to the coordinator and records the abort intent', async () => {
		const { storage } = makeFakeSql();
		const runtime = makeRuntime();
		const instance = makeInstance(storage);
		const executionStore = prepare(runtime, instance);
		await executionStore.submissions.admitDispatch(dispatchInput());
		// Agent processing is intentionally unavailable here; reconciliation logs
		// and leaves the queued submission stamped. We assert the routing + the
		// durable abort intent; the settle-to-aborted behavior is covered by the
		// store contract and the Node integration test.
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

		const response = await runtime.onRequest(
			instance,
			new Request('https://flue.invalid/agents/assistant/agent-1/abort', { method: 'POST' }),
		);

		expect(response).not.toBeNull();
		expect(await response?.json()).toEqual({ aborted: true });
		expect(await executionStore.submissions.getSubmission('dispatch-1')).toMatchObject({
			status: 'queued',
			abortRequestedAt: expect.any(Number),
		});
		consoleError.mockRestore();
	});

	it('admits an internal dispatch within the instance context', async () => {
		const { storage } = makeFakeSql();
		const recovery = makeRecoveryContext({ inspection: 'absent' });
		// Mirror production: createContext-dependent code reaches
		// getCloudflareContext(), which throws unless an instance context is
		// active. The internal dispatch route must run inside one.
		const contextStore = new AsyncLocalStorage<true>();
		const runtime = createCloudflareAgentRuntime({
			agents: [{ name: 'assistant', definition: {} as never }],
			createContext: () => {
				if (!contextStore.getStore()) {
					throw new Error('[flue] createContext ran outside the instance context.');
				}
				return recovery.ctx;
			},
			runWithInstanceContext: (_instance, _agentName, callback) =>
				contextStore.run(true, callback),
		});
		const instance = makeInstance(storage);
		const executionStore = prepare(runtime, instance);

		const response = await runtime.onRequest(
			instance,
			new Request('https://flue.invalid/__flue/internal/dispatch', {
				method: 'POST',
				body: JSON.stringify(dispatchInput()),
			}),
		);

		expect(response?.status).toBe(200);
		expect(await response?.json()).toMatchObject({ dispatchId: 'dispatch-1' });
		expect(await executionStore.submissions.getSubmission('dispatch-1')).toMatchObject({
			canonicalReadyAt: expect.any(Number),
		});
	});

	it('reconciles unsettled work within the instance context on startup', async () => {
		const { storage } = makeFakeSql();
		const recovery = makeRecoveryContext({ inspection: 'absent' });
		const contextStore = new AsyncLocalStorage<true>();
		const runtime = createCloudflareAgentRuntime({
			agents: [{ name: 'assistant', definition: {} as never }],
			createContext: () => {
				if (!contextStore.getStore()) {
					throw new Error('[flue] createContext ran outside the instance context.');
				}
				return recovery.ctx;
			},
			runWithInstanceContext: (_instance, _agentName, callback) =>
				contextStore.run(true, callback),
		});
		const instance = makeInstance(storage);
		const executionStore = prepare(runtime, instance);
		await executionStore.submissions.admitDispatch(dispatchInput());

		await runtime.onStart(instance, () => {});

		expect(await executionStore.submissions.getSubmission('dispatch-1')).toMatchObject({
			canonicalReadyAt: expect.any(Number),
		});
	});

	it('processes a submission within the instance context from a detached fiber', async () => {
		const { storage } = makeFakeSql();
		const processedInputs: unknown[] = [];
		const session = {
			async processSubmissionInput(input: unknown) {
				processedInputs.push(input);
			},
			async recordSubmissionTerminal() {
				return [];
			},
		};
		// The submission fiber can resume on a fresh isolate with no ambient
		// context, so it must establish its own. Enforce that by requiring an
		// active context for createContext and by running the fiber body only
		// after onStart returns — i.e. outside any entry-point context.
		const contextStore = new AsyncLocalStorage<true>();
		const runtime = createCloudflareAgentRuntime({
			agents: [{ name: 'assistant', definition: {} as never }],
			createContext: () => {
				if (!contextStore.getStore()) {
					throw new Error('[flue] createContext ran outside the instance context.');
				}
				return {
					async initializeRootHarness() {
						return {
							async session() {
								return session;
							},
						};
					},
					setEventCallback() {},
					createEvent(event: unknown) {
						return event;
					},
					publishEvent() {},
					emitEvent(event: unknown) {
						return event;
					},
					async flushEventCallbacks() {},
					subscribeEvent() {
						return () => {};
					},
				} as unknown as FlueContextInternal;
			},
			runWithInstanceContext: (_instance, _agentName, callback) =>
				contextStore.run(true, callback),
		});
		const instance = makeInstance(storage);
		let runDetachedFiber: (() => Promise<void>) | undefined;
		instance.runFiber = async (_name, callback) => {
			runDetachedFiber = () => callback({ stash() {} });
		};
		const executionStore = prepare(runtime, instance);
		await executionStore.submissions.admitDispatch(dispatchInput());
		await executionStore.submissions.markSubmissionCanonicalReady('dispatch-1');

		await runtime.onStart(instance, () => {});
		expect(runDetachedFiber).toBeDefined();
		await runDetachedFiber?.();

		expect(processedInputs).toEqual([
			{
				kind: 'dispatch',
				submissionId: 'dispatch-1',
				agent: 'assistant',
				id: 'agent-1',
				message: { kind: 'signal', type: 'test.event', body: 'Hello' },
				acceptedAt: '2026-06-03T00:00:00.000Z',
			},
		]);
	});

	it('reports nothing to abort for an instance with no unsettled work', async () => {
		const { storage } = makeFakeSql();
		const runtime = makeRuntime();
		const instance = makeInstance(storage);
		prepare(runtime, instance);

		const response = await runtime.onRequest(
			instance,
			new Request('https://flue.invalid/agents/assistant/agent-1/abort', { method: 'POST' }),
		);

		expect(await response?.json()).toEqual({ aborted: false });
	});
});
