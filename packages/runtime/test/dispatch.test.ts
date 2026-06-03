import {
	type FauxProviderRegistration,
	fauxAssistantMessage,
	registerFauxProvider,
} from '@earendil-works/pi-ai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAgent } from '../src/agent-definition.ts';
import { dispatch, observe } from '../src/index.ts';
import {
	configureFlueRuntime,
	createAgentDispatchProcessor,
	createFlueContext,
	type DispatchInput,
	InMemoryDispatchQueue,
	validateAgentDispatchAdmission,
	InMemorySessionStore,
	resetFlueRuntimeForTests,
} from '../src/internal.ts';
import type { AgentConfig, FlueHarness, FlueSession } from '../src/types.ts';
import { createNoopSessionEnv } from './fixtures/session-env.ts';

const providers: FauxProviderRegistration[] = [];

afterEach(() => {
	resetFlueRuntimeForTests();
	for (const provider of providers.splice(0)) provider.unregister();
});

describe('dispatch()', () => {
	it('rejects calls when the runtime has not been configured', async () => {
		await expect(
			dispatch({ agent: 'moderator', id: 'guild:unconfigured', input: { type: 'flagged' } }),
		).rejects.toThrow('dispatch() called before runtime was configured');
	});

	it('returns an admission receipt before model processing completes when a named agent dispatch is accepted', async () => {
		let releaseProcessing: (() => void) | undefined;
		const processingPending = new Promise<void>((resolve) => {
			releaseProcessing = resolve;
		});
		let processingCompleted = false;
		configureFlueRuntime({
			target: 'node',
			dispatchQueue: new InMemoryDispatchQueue({
				async process() {
					await processingPending;
					processingCompleted = true;
				},
			}),
			manifest: { agents: [{ name: 'moderator', transports: {}, created: true }] },
		});

		try {
			const receipt = await dispatch({
				agent: 'moderator',
				id: 'guild:admission',
				session: 'case:admission',
				input: { type: 'flagged', reportId: 'report:admission' },
			});

			expect(receipt).toEqual({
				dispatchId: expect.any(String),
				acceptedAt: expect.any(String),
			});
			expect(processingCompleted).toBe(false);
		} finally {
			releaseProcessing?.();
		}
		await vi.waitFor(() => {
			expect(processingCompleted).toBe(true);
		});
	});

	it('resolves a discovered agent name when dispatch() receives a created agent target', async () => {
		const moderator = createAgent(() => ({ model: false }));
		const admitted: DispatchInput[] = [];
		configureFlueRuntime({
			target: 'node',
			dispatchQueue: {
				async enqueue(input) {
					admitted.push(input);
					return { dispatchId: input.dispatchId, acceptedAt: input.acceptedAt };
				},
			},
			resolveDispatchAgentName: (candidate) => (candidate === moderator ? 'moderator' : undefined),
			manifest: { agents: [{ name: 'moderator', transports: {}, created: true }] },
		});

		await dispatch(moderator, {
			id: 'guild:created',
			session: 'case:created',
			input: { type: 'flagged', reportId: 'report:created' },
		});

		expect(admitted).toMatchObject([
			{
				agent: 'moderator',
				id: 'guild:created',
				session: 'case:created',
				input: { type: 'flagged', reportId: 'report:created' },
			},
		]);
	});

	it('rejects a created agent target when the built application cannot resolve its identity', async () => {
		const localModerator = createAgent(() => ({ model: false }));
		configureFlueRuntime({
			target: 'node',
			dispatchQueue: new InMemoryDispatchQueue(),
			resolveDispatchAgentName: () => undefined,
			manifest: { agents: [{ name: 'moderator', transports: {}, created: true }] },
		});

		await expect(
			dispatch(localModerator, {
				id: 'guild:local',
				input: { type: 'flagged', reportId: 'report:local' },
			}),
		).rejects.toThrow('not a discovered default-exported agent');
	});

	it('defaults the session name when dispatch() receives no session', async () => {
		const admitted: DispatchInput[] = [];
		configureFlueRuntime({
			target: 'node',
			dispatchQueue: {
				async enqueue(input) {
					admitted.push(input);
					return { dispatchId: input.dispatchId, acceptedAt: input.acceptedAt };
				},
			},
			manifest: { agents: [{ name: 'moderator', transports: {}, created: true }] },
		});

		await dispatch({
			agent: 'moderator',
			id: 'guild:default-session',
			input: { type: 'flagged', reportId: 'report:default-session' },
		});

		expect(admitted).toMatchObject([
			{
				agent: 'moderator',
				id: 'guild:default-session',
				session: 'default',
				input: { type: 'flagged', reportId: 'report:default-session' },
			},
		]);
	});

	it('snapshots JSON-like input when dispatch() admits a payload', async () => {
		const admitted: DispatchInput[] = [];
		const payload = { type: 'flagged', report: { id: 'report:snapshot', count: 1 } };
		configureFlueRuntime({
			target: 'node',
			dispatchQueue: {
				async enqueue(input) {
					admitted.push(input);
					return { dispatchId: input.dispatchId, acceptedAt: input.acceptedAt };
				},
			},
			manifest: { agents: [{ name: 'moderator', transports: {}, created: true }] },
		});

		await dispatch({ agent: 'moderator', id: 'guild:snapshot', input: payload });
		payload.report.count = 2;

		expect(admitted[0]?.input).toEqual({
			type: 'flagged',
			report: { id: 'report:snapshot', count: 1 },
		});
	});

	it('rejects missing input when dispatch() receives an undefined payload', async () => {
		configureFlueRuntime({
			target: 'node',
			dispatchQueue: new InMemoryDispatchQueue(),
			manifest: { agents: [{ name: 'moderator', transports: {}, created: true }] },
		});

		await expect(
			dispatch({ agent: 'moderator', id: 'guild:undefined-input', input: undefined }),
		).rejects.toThrow('requires an "input" payload');
	});

	it('rejects non-JSON-like input when dispatch() receives a function value', async () => {
		configureFlueRuntime({
			target: 'node',
			dispatchQueue: new InMemoryDispatchQueue(),
			manifest: { agents: [{ name: 'moderator', transports: {}, created: true }] },
		});

		await expect(
			dispatch({
				agent: 'moderator',
				id: 'guild:function-input',
				input: { type: 'flagged', callback: () => 'unsupported' },
			}),
		).rejects.toThrow('must not contain function values');
	});

	it('rejects non-JSON-like input when dispatch() receives a bigint value', async () => {
		configureFlueRuntime({
			target: 'node',
			dispatchQueue: new InMemoryDispatchQueue(),
			manifest: { agents: [{ name: 'moderator', transports: {}, created: true }] },
		});

		await expect(
			dispatch({
				agent: 'moderator',
				id: 'guild:bigint-input',
				input: { type: 'flagged', reportId: 1n },
			}),
		).rejects.toThrow('must not contain bigint values');
	});

	it('rejects non-JSON-like input when dispatch() receives a non-plain object', async () => {
		configureFlueRuntime({
			target: 'node',
			dispatchQueue: new InMemoryDispatchQueue(),
			manifest: { agents: [{ name: 'moderator', transports: {}, created: true }] },
		});

		await expect(
			dispatch({
				agent: 'moderator',
				id: 'guild:date-input',
				input: { type: 'flagged', acceptedAt: new Date('2026-06-01T00:00:00.000Z') },
			}),
		).rejects.toThrow('must contain only plain JSON objects');
	});

	it('rejects an unknown agent when dispatch() targets an unregistered name', async () => {
		configureFlueRuntime({
			target: 'node',
			dispatchQueue: new InMemoryDispatchQueue(),
			manifest: { agents: [{ name: 'moderator', transports: {}, created: true }] },
		});

		await expect(
			dispatch({ agent: 'missing', id: 'guild:unknown-agent', input: { type: 'flagged' } }),
		).rejects.toThrow('target agent "missing" is not registered');
	});

	it('rejects a blank agent instance id when dispatch() receives an id', async () => {
		configureFlueRuntime({
			target: 'node',
			dispatchQueue: new InMemoryDispatchQueue(),
			manifest: { agents: [{ name: 'moderator', transports: {}, created: true }] },
		});

		await expect(
			dispatch({ agent: 'moderator', id: '  ', input: { type: 'flagged' } }),
		).rejects.toThrow('requires a non-empty "id" target agent instance id');
	});

	it('rejects a blank session name when dispatch() receives a session', async () => {
		configureFlueRuntime({
			target: 'node',
			dispatchQueue: new InMemoryDispatchQueue(),
			manifest: { agents: [{ name: 'moderator', transports: {}, created: true }] },
		});

		await expect(
			dispatch({ agent: 'moderator', id: 'guild:blank-session', session: '  ', input: null }),
		).rejects.toThrow('requires a non-empty "session" target session id');
	});

	it('rejects a reserved task session name when dispatch() receives a session', async () => {
		configureFlueRuntime({
			target: 'node',
			dispatchQueue: new InMemoryDispatchQueue(),
			manifest: { agents: [{ name: 'moderator', transports: {}, created: true }] },
		});

		await expect(
			dispatch({
				agent: 'moderator',
				id: 'guild:task-session',
				session: 'task:default:child',
				input: null,
			}),
		).rejects.toThrow('session names beginning with "task:" are reserved for delegated tasks');
	});

	it('rejects a reserved task session name when durable dispatch admission receives internal input', async () => {
		await expect(
			validateAgentDispatchAdmission({
				input: {
					dispatchId: 'dispatch:task-session',
					agent: 'moderator',
					id: 'guild:task-session',
					session: 'task:default:child',
					input: null,
					acceptedAt: '2026-06-02T00:00:00.000Z',
				},
			}),
		).rejects.toThrow('session names beginning with "task:" are reserved for delegated tasks');
	});

	it('rejects calls when the runtime has no dispatch queue', async () => {
		configureFlueRuntime({
			target: 'node',
			manifest: { agents: [{ name: 'moderator', transports: {}, created: true }] },
		});

		await expect(
			dispatch({ agent: 'moderator', id: 'guild:no-queue', input: { type: 'flagged' } }),
		).rejects.toThrow('no dispatch queue is configured');
	});
});

describe('dispatched session processing', () => {
	it('preserves admission order when the default Node queue processes multiple inputs for one agent instance session', async () => {
		let releaseFirst: (() => void) | undefined;
		const firstPending = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});
		const processingOrder: string[] = [];
		const queue = new InMemoryDispatchQueue({
			async process(input) {
				processingOrder.push(input.dispatchId);
				if (input.dispatchId === 'dispatch:queue:first') await firstPending;
			},
		});

		try {
			await queue.enqueue({
				dispatchId: 'dispatch:queue:first',
				agent: 'moderator',
				id: 'guild:queue',
				session: 'case:queue',
				input: { type: 'flagged', reportId: 'report:queue:first' },
				acceptedAt: '2026-06-01T00:00:00.000Z',
			});
			await queue.enqueue({
				dispatchId: 'dispatch:queue:second',
				agent: 'moderator',
				id: 'guild:queue',
				session: 'case:queue',
				input: { type: 'flagged', reportId: 'report:queue:second' },
				acceptedAt: '2026-06-01T00:00:01.000Z',
			});
			await vi.waitFor(() => {
				expect(processingOrder).toEqual(['dispatch:queue:first']);
			});
		} finally {
			releaseFirst?.();
		}

		await vi.waitFor(() => {
			expect(processingOrder).toEqual(['dispatch:queue:first', 'dispatch:queue:second']);
		});
	});

	it('exposes instanceId and dispatchId without runId when observe() receives dispatched agent activity', async () => {
		const events: unknown[] = [];
		const stopObserving = observe((event, ctx) => {
			if (ctx.id === 'guild:observe-dispatch') events.push(event);
		});
		const processor = createAgentDispatchProcessor({
			agents: { moderator: createAgent(() => ({ model: false })) },
			createContext: (...args) => {
				const ctx = createTestContext(...args);
				ctx.initializeCreatedAgent = async () =>
					({
						name: 'default',
						session: async (name?: string) =>
							({
								name: name ?? 'default',
								processDispatchInput: async () => {
									ctx.emitEvent({ type: 'idle' });
								},
							}) as unknown as FlueSession & {
								processDispatchInput(input: DispatchInput): Promise<void>;
							},
						sessions: {} as never,
						shell: (() => Promise.resolve({ stdout: '', stderr: '', exitCode: 0 })) as never,
						fs: {} as never,
					}) satisfies FlueHarness;
				return ctx;
			},
		});

		try {
			await processor.process({
				dispatchId: 'dispatch:observe',
				agent: 'moderator',
				id: 'guild:observe-dispatch',
				session: 'case:observe-dispatch',
				input: { type: 'flagged', reportId: 'report:observe-dispatch' },
				acceptedAt: '2026-06-01T00:00:00.000Z',
			});

			expect(events).toEqual([
				{
					type: 'idle',
					instanceId: 'guild:observe-dispatch',
					dispatchId: 'dispatch:observe',
					eventIndex: 0,
					timestamp: expect.any(String),
				},
			]);
			expect(events[0]).not.toHaveProperty('runId');
		} finally {
			stopObserving();
		}
	});

	it('avoids creating workflow run history when a dispatched input is processed', async () => {
		const contextRunIds: Array<string | undefined> = [];
		const contextDispatchIds: Array<string | undefined> = [];
		const processor = createAgentDispatchProcessor({
			agents: { moderator: createAgent(() => ({ model: false })) },
			createContext: (...args) => {
				contextRunIds.push(args[1]);
				contextDispatchIds.push(args[5]);
				const ctx = createTestContext(...args);
				ctx.initializeCreatedAgent = async () =>
					({
						name: 'default',
						session: async (name?: string) =>
							({
								name: name ?? 'default',
								processDispatchInput: async () => {},
							}) as unknown as FlueSession & {
								processDispatchInput(input: DispatchInput): Promise<void>;
							},
						sessions: {} as never,
						shell: (() => Promise.resolve({ stdout: '', stderr: '', exitCode: 0 })) as never,
						fs: {} as never,
					}) satisfies FlueHarness;
				return ctx;
			},
		});

		await processor.process({
			dispatchId: 'dispatch:no-run-history',
			agent: 'moderator',
			id: 'guild:no-run-history',
			session: 'case:no-run-history',
			input: { type: 'flagged', reportId: 'report:no-run-history' },
			acceptedAt: '2026-06-01T00:00:00.000Z',
		});

		expect(contextRunIds).toEqual([undefined]);
		expect(contextDispatchIds).toEqual(['dispatch:no-run-history']);
	});

	it('avoids repeating model processing when the same dispatch id is retried before the session advances', async () => {
		const provider = createProvider();
		let modelProcessingCount = 0;
		provider.setResponses([
			() => {
				modelProcessingCount += 1;
				return fauxAssistantMessage('processed idempotently');
			},
		]);
		const store = new InMemorySessionStore();
		const save = vi.spyOn(store, 'save');
		const processor = createAgentDispatchProcessor({
			agents: {
				moderator: createAgent(() => ({
					model: `${provider.getModel().provider}/${provider.getModel().id}`,
				})),
			},
			createContext: (id, runId, payload, req, initialEventIndex, dispatchId) =>
				createFlueContext({
					id,
					runId,
					dispatchId,
					payload,
					env: {},
					req,
					initialEventIndex,
					agentConfig: {
						systemPrompt: '',
						skills: {},
						subagents: {},
						model: undefined,
						resolveModel: () => provider.getModel(),
					},
					createDefaultEnv: async () => createNoopSessionEnv({ cwd: '/' }),
					defaultStore: store,
				}),
		});
		const input: DispatchInput = {
			dispatchId: 'dispatch:retry-idempotent',
			agent: 'moderator',
			id: 'guild:retry-idempotent',
			session: 'case:retry-idempotent',
			input: { type: 'flagged', reportId: 'report:retry-idempotent' },
			acceptedAt: '2026-06-01T00:00:00.000Z',
		};

		await processor.process(input);
		await processor.process(input);

		const data = save.mock.calls.at(-1)?.[1];
		expect(modelProcessingCount).toBe(1);
		expect(
			data?.entries.filter((entry) => entry.type === 'message' && entry.message.role === 'user'),
		).toHaveLength(1);
		expect(data?.entries[0]).toMatchObject({
			source: 'dispatch',
			dispatch: { dispatchId: 'dispatch:retry-idempotent' },
		});
	});

	it('continues a persisted transient failure when the same dispatch id is replayed', async () => {
		vi.useFakeTimers();
		try {
			const provider = createProvider();
			provider.setResponses([fauxAssistantMessage('recovered dispatch')]);
			const store = new InMemorySessionStore();
			const processor = createAgentDispatchProcessor({
				agents: {
					moderator: createAgent(() => ({
						model: `${provider.getModel().provider}/${provider.getModel().id}`,
					})),
				},
				createContext: (id, runId, payload, req, initialEventIndex, dispatchId) =>
					createFlueContext({
						id,
						runId,
						dispatchId,
						payload,
						env: {},
						req,
						initialEventIndex,
						agentConfig: {
							systemPrompt: '',
							skills: {},
							subagents: {},
							model: undefined,
							resolveModel: () => provider.getModel(),
						},
						createDefaultEnv: async () => createNoopSessionEnv({ cwd: '/' }),
						defaultStore: store,
					}),
			});
			const input: DispatchInput = {
				dispatchId: 'dispatch:retry-transient',
				agent: 'moderator',
				id: 'guild:retry-transient',
				session: 'case:retry-transient',
				input: { type: 'flagged', reportId: 'report:retry-transient' },
				acceptedAt: '2026-06-01T00:00:00.000Z',
			};
			const timestamp = '2026-06-01T00:00:00.000Z';
			await store.save(`agent-session:${JSON.stringify([input.id, 'default', input.session])}`, {
				version: 5,
				affinityKey: 'aff_01KT3P3GZGFBCKHKMQ11A7H2HW',
				entries: [
					{
						type: 'message',
						id: 'dispatch-input',
						parentId: null,
						timestamp,
						message: {
							role: 'user',
							content: [{ type: 'text', text: 'persisted dispatch' }],
							timestamp: 0,
						},
						source: 'dispatch',
						dispatch: input,
					},
					{
						type: 'message',
						id: 'transient-error',
						parentId: 'dispatch-input',
						timestamp,
						message: fauxAssistantMessage('', {
							stopReason: 'error',
							errorMessage: 'overloaded_error',
						}),
						source: 'dispatch',
					},
				],
				leafId: 'transient-error',
				metadata: {},
				createdAt: timestamp,
				updatedAt: timestamp,
			});

			const recovered = processor.process(input);
			await vi.runAllTimersAsync();

			await expect(recovered).resolves.toBeUndefined();
			expect(provider.state.callCount).toBe(1);
		} finally {
			vi.useRealTimers();
		}
	});

	it('rejects a retried dispatch when later user input has already advanced the session', async () => {
		const provider = createProvider();
		provider.setResponses([
			fauxAssistantMessage('processed before advancement'),
			fauxAssistantMessage('processed later input'),
		]);
		const store = new InMemorySessionStore();
		const processor = createAgentDispatchProcessor({
			agents: {
				moderator: createAgent(() => ({
					model: `${provider.getModel().provider}/${provider.getModel().id}`,
				})),
			},
			createContext: (id, runId, payload, req, initialEventIndex, dispatchId) =>
				createFlueContext({
					id,
					runId,
					dispatchId,
					payload,
					env: {},
					req,
					initialEventIndex,
					agentConfig: {
						systemPrompt: '',
						skills: {},
						subagents: {},
						model: undefined,
						resolveModel: () => provider.getModel(),
					},
					createDefaultEnv: async () => createNoopSessionEnv({ cwd: '/' }),
					defaultStore: store,
				}),
		});
		const input: DispatchInput = {
			dispatchId: 'dispatch:retry-advanced',
			agent: 'moderator',
			id: 'guild:retry-advanced',
			session: 'case:retry-advanced',
			input: { type: 'flagged', reportId: 'report:retry-advanced' },
			acceptedAt: '2026-06-01T00:00:00.000Z',
		};

		await processor.process(input);
		await processor.process({
			dispatchId: 'dispatch:retry-advanced:later',
			agent: 'moderator',
			id: 'guild:retry-advanced',
			session: 'case:retry-advanced',
			input: { type: 'flagged', reportId: 'report:retry-advanced:later' },
			acceptedAt: '2026-06-01T00:00:01.000Z',
		});

		await expect(processor.process(input)).rejects.toThrow(
			'Cannot recover dispatched input after the session has advanced',
		);
	});
});

function createTestContext(
	id: string,
	runId: string | undefined,
	payload: unknown,
	req: Request,
	initialEventIndex?: number,
	dispatchId?: string,
) {
	return createFlueContext({
		id,
		runId,
		dispatchId,
		payload,
		env: {},
		req,
		initialEventIndex,
		agentConfig: testAgentConfig(),
		createDefaultEnv: async () => createNoopSessionEnv({ cwd: '/' }),
		defaultStore: new InMemorySessionStore(),
	});
}

function testAgentConfig(): AgentConfig {
	return {
		systemPrompt: '',
		skills: {},
		subagents: {},
		model: { id: 'test-model', provider: 'test', api: 'test' } as never,
		resolveModel: () => ({ id: 'test-model', provider: 'test', api: 'test' }) as never,
	};
}

function createProvider(): FauxProviderRegistration {
	const provider = registerFauxProvider({ provider: `dispatch-test-${crypto.randomUUID()}` });
	providers.push(provider);
	return provider;
}
