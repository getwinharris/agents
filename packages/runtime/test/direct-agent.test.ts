import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { flue } from '../src/app.ts';
import {
	configureFlueRuntime,
	createDirectAgentHandler,
	createFlueContext,
	createRunSubscriberRegistry,
	InMemoryDispatchQueue,
	InMemoryRunRegistry,
	InMemoryRunStore,
	InMemorySessionStore,
} from '../src/internal.ts';
import { createAgent } from '../src/agent-definition.ts';
import type { FlueHarness, FlueSession, SessionData, SessionEnv, SessionStore } from '../src/types.ts';

describe('direct attached agent delivery', () => {
	it('routes direct HTTP through init and the default session without dispatch', async () => {
		const initCalls: string[] = [];
		const prompts: Array<{ session: string; message: string }> = [];
		const dispatches: unknown[] = [];

		const agent = createAgent(({ id, payload }) => {
			initCalls.push(`${id}:${String(payload)}`);
			return { model: false };
		});
		const initialize = (id: string, runId: string | undefined, payload: unknown, req: Request) => {
			const ctx = createTestContext(id, runId, payload, req);
			ctx.initializeCreatedAgent = async (created, agentPayload) => {
				await created.initialize({ id: ctx.id, env: {}, payload: agentPayload });
				return fakeHarness(prompts);
			};
			return ctx;
		};

		configureFlueRuntime({
			target: 'node',
			manifest: {
				agents: [{ name: 'assistant', channels: {}, created: true }],
			},
			handlers: { assistant: createDirectAgentHandler(agent) },
			dispatchQueue: new InMemoryDispatchQueue({
				process(input) {
					dispatches.push(input);
				},
			}),
			createContext: initialize,
			runStore: new InMemoryRunStore(),
			runRegistry: new InMemoryRunRegistry(),
			runSubscribers: createRunSubscriberRegistry(),
		});

		const app = new Hono();
		app.route('/', flue());

		const res = await app.fetch(
			new Request('http://localhost/agents/assistant/inst-1', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ message: 'hello' }),
			}),
		);

		expect(res.status).toBe(200);
		expect((await res.json()) as unknown).toEqual({ result: { text: 'reply:hello', usage: {}, model: { id: 'test' } } });
		expect(res.headers.get('x-flue-run-id')).toBeNull();
		expect(initCalls).toEqual(['inst-1:undefined']);
		expect(prompts).toEqual([{ session: 'default', message: 'hello' }]);
		expect(dispatches).toEqual([]);
	});

	it('documents the attached message/session body and attached SSE response', async () => {
		configureFlueRuntime({
			target: 'node',
			manifest: {
				agents: [{ name: 'assistant', channels: { http: true }, created: true }],
			},
			handlers: { assistant: createDirectAgentHandler(createAgent(() => ({ model: false }))) },
			createContext: createFakeContext([]),
		});

		const app = new Hono();
		app.route('/', flue());
		const spec = (await (await app.fetch(new Request('http://localhost/openapi.json'))).json()) as {
			paths: Record<string, { post?: { requestBody?: { required?: boolean; content?: Record<string, { schema?: unknown }> }; responses?: Record<string, { content?: Record<string, unknown> }> } }>;
		};
		const operation = spec.paths['/agents/{name}/{id}']?.post;
		expect(operation?.requestBody?.required).toBe(true);
		expect(operation?.requestBody?.content?.['application/json']?.schema).toMatchObject({
			type: 'object',
			required: ['message'],
			properties: { message: { type: 'string' }, session: { type: 'string', minLength: 1, pattern: '.*\\S.*' } },
		});
		expect(operation?.responses?.['200']?.content?.['application/json']).toBeDefined();
		expect(operation?.responses?.['200']?.content?.['text/event-stream']).toBeDefined();
		expect(operation?.responses?.['200']?.content?.['text/event-stream']).toMatchObject({
			schema: { description: expect.stringContaining('terminal event: error frame') },
		});
	});

	it('routes direct HTTP to a supplied session', async () => {
		const prompts: Array<{ session: string; message: string }> = [];

		configureFlueRuntime({
			target: 'node',
			manifest: {
				agents: [{ name: 'assistant', channels: {}, created: true }],
			},
			handlers: { assistant: createDirectAgentHandler(createAgent(() => ({ model: false }))) },
			createContext: createFakeContext(prompts),
			runStore: new InMemoryRunStore(),
			runRegistry: new InMemoryRunRegistry(),
			runSubscribers: createRunSubscriberRegistry(),
		});

		const app = new Hono();
		app.route('/', flue());

		const res = await app.fetch(
			new Request('http://localhost/agents/assistant/inst-1', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ message: 'hello', session: 'case:123' }),
			}),
		);

		expect(res.status).toBe(200);
		expect(prompts).toEqual([{ session: 'case:123', message: 'hello' }]);
	});

	it('keeps SSE streaming behavior for direct HTTP callers', async () => {
		configureFlueRuntime({
			target: 'node',
			manifest: {
				agents: [{ name: 'assistant', channels: {}, created: true }],
			},
			handlers: { assistant: createDirectAgentHandler(createAgent(() => ({ model: false }))) },
			createContext: createFakeContext([]),
			runStore: new InMemoryRunStore(),
			runRegistry: new InMemoryRunRegistry(),
			runSubscribers: createRunSubscriberRegistry(),
		});

		const app = new Hono();
		app.route('/', flue());

		const res = await app.fetch(
			new Request('http://localhost/agents/assistant/inst-1', {
				method: 'POST',
				headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
				body: JSON.stringify({ message: 'hello' }),
			}),
		);

		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toContain('text/event-stream');
		const stream = await res.text();
		expect(stream).not.toContain('event: run_start');
		expect(stream).toContain('event: idle');
		expect(stream).toContain('"instanceId":"inst-1"');
		expect(stream).not.toContain('"runId"');
		expect(stream).not.toContain('event: run_end');
	});

	it('streams structured correlated errors for failed attached prompts', async () => {
		configureFlueRuntime({
			target: 'node',
			manifest: { agents: [{ name: 'assistant', channels: { http: true }, created: true }] },
			handlers: { assistant: async () => { throw new Error('do not leak'); } },
			createContext: createTestContext,
		});

		const app = new Hono();
		app.route('/', flue());
		const res = await app.fetch(new Request('http://localhost/agents/assistant/inst-1', {
			method: 'POST',
			headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
			body: JSON.stringify({ message: 'hello' }),
		}));
		const stream = await res.text();
		expect(stream).toContain('event: error');
		expect(stream).toContain('"type":"error"');
		expect(stream).toContain('"instanceId":"inst-1"');
		expect(stream).toContain('"type":"internal_error"');
		expect(stream).not.toContain('do not leak');
	});

	it('rejects non-provisional direct payload shapes clearly', async () => {
		configureFlueRuntime({
			target: 'node',
			manifest: {
				agents: [{ name: 'assistant', channels: {}, created: true }],
			},
			handlers: { assistant: createDirectAgentHandler(createAgent(() => ({ model: false }))) },
			createContext: createTestContext,
		});

		const app = new Hono();
		app.route('/', flue());

		const res = await app.fetch(
			new Request('http://localhost/agents/assistant/inst-1', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ text: 'wrong' }),
			}),
		);

		expect(res.status).toBe(400);
		expect((await res.json()) as unknown).toMatchObject({ error: { type: 'invalid_request' } });
	});

	it('passes the target instance id into created-agent sandbox factories', async () => {
		const sandboxCalls: Array<{ id: string; cwd?: string }> = [];
		const prompts: Array<{ session: string; message: string }> = [];
		const store = new RecordingSessionStore();

		configureFlueRuntime({
			target: 'node',
			manifest: {
				agents: [{ name: 'assistant', channels: {}, created: true }],
			},
			handlers: {
				assistant: createDirectAgentHandler(createAgent(() => ({
					profile: { model: false },
					cwd: '/workspace',
					persist: store,
					sandbox: {
						async createSessionEnv(options) {
							sandboxCalls.push(options);
							return fakeEnv();
						},
					},
				}))),
			},
			createContext: createTestContext,
		});

		const app = new Hono();
		app.route('/', flue());

		const res = await app.fetch(
			new Request('http://localhost/agents/assistant/inst-1', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ message: 'hello' }),
			}),
		);

		expect(res.status).toBe(500);
		expect(sandboxCalls).toEqual([{ id: 'inst-1', cwd: '/workspace' }]);
		expect(store.loadCalls).toContain('agent-session:["inst-1","default","default"]');
		expect(prompts).toEqual([]);
	});
});

function fakeHarness(prompts: Array<{ session: string; message: string }>): FlueHarness {
	return {
		name: 'default',
		session: async (name?: string) => fakeSession(name ?? 'default', prompts),
		sessions: {} as never,
		shell: (() => Promise.resolve({ stdout: '', stderr: '', exitCode: 0 })) as never,
		fs: {} as never,
	};
}

function fakeSession(session: string, prompts: Array<{ session: string; message: string }>): FlueSession & { processDirectInput(input: { message: string }): PromiseLike<unknown> } {
	return {
		name: session,
		prompt: (() => Promise.resolve({ text: '', usage: {}, model: { id: 'test' } })) as never,
		processDirectInput: ({ message }: { message: string }) => {
			prompts.push({ session, message });
			return Promise.resolve({ text: `reply:${message}`, usage: {}, model: { id: 'test' } });
		},
		shell: (() => Promise.resolve({ stdout: '', stderr: '', exitCode: 0 })) as never,
		fs: {} as never,
		skill: (() => Promise.resolve({ text: '', usage: {}, model: { id: 'test' } })) as never,
		task: (() => Promise.resolve({ text: '', usage: {}, model: { id: 'test' } })) as never,
		compact: async () => {},
		delete: async () => {},
	};
}

function createFakeContext(prompts: Array<{ session: string; message: string }>) {
	return (id: string, runId: string | undefined, payload: unknown, req: Request) => {
		const ctx = createTestContext(id, runId, payload, req);
		ctx.initializeCreatedAgent = async (agent, agentPayload) => {
			await agent.initialize({ id, env: {}, payload: agentPayload });
			return fakeHarness(prompts);
		};
		return ctx;
	};
}

function createTestContext(id: string, runId: string | undefined, payload: unknown, req: Request) {
	return createFlueContext({
		id,
		runId,
		payload,
		env: {},
		req,
		agentConfig: {
			systemPrompt: '',
			skills: {},
			model: undefined,
			resolveModel: () => undefined,
		},
		createDefaultEnv: async () => ({}) as never,
		defaultStore: new InMemorySessionStore(),
	});
}

function fakeEnv(): SessionEnv {
	return {
		exec: async () => ({ stdout: '', stderr: '', exitCode: 0 }),
		readFile: async () => '',
		readFileBuffer: async () => new Uint8Array(),
		writeFile: async () => {},
		stat: async () => ({ isFile: true, isDirectory: false, isSymbolicLink: false, size: 0, mtime: new Date() }),
		readdir: async () => [],
		exists: async () => false,
		mkdir: async () => {},
		rm: async () => {},
		cwd: '/',
		resolvePath: (path) => path,
	};
}

class RecordingSessionStore implements SessionStore {
	readonly loadCalls: string[] = [];
	async save(_id: string, _data: SessionData): Promise<void> {}
	async load(id: string): Promise<SessionData | null> {
		this.loadCalls.push(id);
		return null;
	}
	async delete(_id: string): Promise<void> {}
}
