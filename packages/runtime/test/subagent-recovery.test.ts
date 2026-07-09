import {
	type FauxProviderRegistration,
	fauxAssistantMessage,
	fauxToolCall,
	registerFauxProvider,
} from '@earendil-works/pi-ai/compat';
import * as v from 'valibot';
import { afterEach, describe, expect, it } from 'vitest';
import { ConversationRecordWriter } from '../src/conversation-writer.ts';
import { defineAgent, defineTool } from '../src/index.ts';
import {
	createBapxContext,
	InMemoryAttachmentStore,
	InMemoryConversationStreamStore,
} from '../src/internal.ts';
import { getInternalSession } from '../src/session.ts';
import { createNoopSessionEnv } from './fixtures/session-env.ts';

const providers: FauxProviderRegistration[] = [];

afterEach(() => {
	for (const provider of providers.splice(0)) provider.unregister();
});

function createProvider(): FauxProviderRegistration {
	const provider = registerFauxProvider({
		provider: `subagent-recovery-${crypto.randomUUID()}`,
		models: [{ id: 'reviewer' }],
	});
	providers.push(provider);
	return provider;
}

const INSTANCE = 'recovery-instance';
const STREAM_PATH = `agents/assistant/${INSTANCE}`;

/**
 * A barrier of `count` parking tool calls. Each `gate` invocation parks forever
 * (faithfully simulating a process killed mid-tool-work: the assistant tool call
 * is durable, no outcome is ever recorded); `reached` resolves once `count`
 * invocations have begun so a test can flush and abandon the operation.
 */
function gateBarrier(count: number): { tool: ReturnType<typeof defineTool>; reached: Promise<void> } {
	let begun = 0;
	let resolve: () => void = () => {};
	const reached = new Promise<void>((r) => {
		resolve = r;
	});
	const tool = defineTool({
		name: 'gate',
		description: 'Parks forever.',
		input: v.object({}),
		run: async () => {
			if (++begun >= count) resolve();
			await new Promise<void>(() => {});
			return 'unreachable';
		},
	});
	return { tool, reached };
}

async function makeWriter(store: InMemoryConversationStreamStore, producerId: string) {
	return ConversationRecordWriter.create({
		store,
		path: STREAM_PATH,
		identity: { agentName: 'assistant', instanceId: INSTANCE },
		producerId,
	});
}

async function makeHarness(
	provider: FauxProviderRegistration,
	writer: ConversationRecordWriter,
	attachmentStore: InMemoryAttachmentStore,
	agent: ReturnType<typeof defineAgent>,
) {
	const ctx = createBapxContext({
		id: INSTANCE,
		env: {},
		agentConfig: {
			resolveModel: (specifier) =>
				specifier ? provider.getModel(specifier.slice(specifier.indexOf('/') + 1)) : undefined,
		},
		createDefaultEnv: async () => createNoopSessionEnv(),
		conversationWriter: writer,
		attachmentStore,
	});
	return ctx.initializeRootHarness(agent);
}

function directInput(submissionId: string, message: string) {
	return {
		kind: 'direct' as const,
		submissionId,
		agent: 'assistant',
		id: INSTANCE,
		message: { kind: 'user' as const, body: message },
		acceptedAt: new Date().toISOString(),
	};
}

function assistantText(
	conversation: Awaited<ReturnType<ConversationRecordWriter['getConversation']>>,
): string[] {
	return [...(conversation?.entries.values() ?? [])].flatMap((entry) =>
		entry.type === 'message' && entry.message.role === 'assistant'
			? entry.message.content.flatMap((block) => (block.type === 'text' ? [block.text] : []))
			: [],
	);
}

function taskOutcomes(
	conversation: Awaited<ReturnType<ConversationRecordWriter['getConversation']>>,
) {
	return [...(conversation?.toolOutcomes.values() ?? [])].filter(
		(outcome) => outcome.toolName === 'task',
	);
}

describe('subagent task recovery', () => {
	it('resumes an interrupted child mid-tool-work and resolves the parent task call from its result', async () => {
		const provider = createProvider();
		const model = `${provider.getModel().provider}/reviewer`;
		const { tool: gate, reached } = gateBarrier(1);
		provider.setResponses([
			fauxAssistantMessage(
				fauxToolCall('task', { prompt: 'Do the work.', agent: 'reviewer' }),
				{ stopReason: 'toolUse' },
			),
			fauxAssistantMessage(fauxToolCall('gate', {}), { stopReason: 'toolUse' }),
			fauxAssistantMessage('Child finished the work.'),
			fauxAssistantMessage('Parent done with the delegated result.'),
		]);
		const agent = defineAgent(() => ({
			model,
			subagents: [{ name: 'reviewer', model, tools: [gate] }],
		}));

		const store = new InMemoryConversationStreamStore();
		const attachments = new InMemoryAttachmentStore();
		const writer = await makeWriter(store, 'producer-1');

		const harness1 = await makeHarness(provider, writer, attachments, agent);
		const internal1 = getInternalSession(await harness1.session());
		if (!internal1) throw new Error('Expected internal session.');
		const parentConversationId = internal1.conversationId;
		void internal1.processSubmissionInput(directInput('submission-parent', 'Delegate.')).catch(() => {});
		await reached;
		await writer.flush();

		const interrupted = await writer.getConversation(parentConversationId);
		const childRef = [...(interrupted?.childConversations.values() ?? [])].find(
			(child) => child.type === 'task',
		);
		if (!childRef) throw new Error('Expected a retained child task conversation.');
		expect(interrupted?.toolOutcomes.size).toBe(0);

		const harness2 = await makeHarness(provider, writer, attachments, agent);
		const internal2 = getInternalSession(await harness2.session());
		if (!internal2) throw new Error('Expected internal session after restart.');
		await internal2.processSubmissionInput(
			directInput('submission-parent', 'Delegate.'),
		);

		expect(assistantText(await writer.getConversation(parentConversationId))).toContain('Parent done with the delegated result.');

		const parent = await writer.getConversation(parentConversationId);
		const resolved = taskOutcomes(parent);
		expect(resolved).toHaveLength(1);
		expect(resolved[0]?.isError).toBe(false);
		expect(resolved[0]?.content).toEqual([{ type: 'text', text: 'Child finished the work.' }]);
		expect(assistantText(await writer.getConversation(childRef.conversationId))).toContain(
			'Child finished the work.',
		);
	});

	it('resumes multiple interrupted children in one trailing batch before the atomic commit', async () => {
		const provider = createProvider();
		const model = `${provider.getModel().provider}/reviewer`;
		const { tool: gate, reached } = gateBarrier(2);
		provider.setResponses([
			fauxAssistantMessage(
				[
					fauxToolCall('task', { prompt: 'First.', agent: 'reviewer' }, { id: 'task-a' }),
					fauxToolCall('task', { prompt: 'Second.', agent: 'reviewer' }, { id: 'task-b' }),
				],
				{ stopReason: 'toolUse' },
			),
			fauxAssistantMessage(fauxToolCall('gate', {}), { stopReason: 'toolUse' }),
			fauxAssistantMessage(fauxToolCall('gate', {}), { stopReason: 'toolUse' }),
			fauxAssistantMessage('First child done.'),
			fauxAssistantMessage('Second child done.'),
			fauxAssistantMessage('Parent done with both.'),
		]);
		const agent = defineAgent(() => ({
			model,
			subagents: [{ name: 'reviewer', model, tools: [gate] }],
		}));

		const store = new InMemoryConversationStreamStore();
		const attachments = new InMemoryAttachmentStore();
		const writer = await makeWriter(store, 'producer-1');

		const harness1 = await makeHarness(provider, writer, attachments, agent);
		const internal1 = getInternalSession(await harness1.session());
		if (!internal1) throw new Error('Expected internal session.');
		const parentConversationId = internal1.conversationId;
		void internal1.processSubmissionInput(directInput('submission-parent', 'Delegate.')).catch(() => {});
		await reached;
		await writer.flush();
		expect([
			...((await writer.getConversation(parentConversationId))?.childConversations.values() ?? []),
		]).toHaveLength(2);

		const harness2 = await makeHarness(provider, writer, attachments, agent);
		const internal2 = getInternalSession(await harness2.session());
		if (!internal2) throw new Error('Expected internal session after restart.');
		await internal2.processSubmissionInput(
			directInput('submission-parent', 'Delegate.'),
		);

		expect(assistantText(await writer.getConversation(parentConversationId))).toContain('Parent done with both.');
		const resolved = taskOutcomes(await writer.getConversation(parentConversationId));
		expect(resolved).toHaveLength(2);
		expect(resolved.every((outcome) => !outcome.isError)).toBe(true);
		expect(
			resolved.flatMap((outcome) => outcome.content.map((block) => (block as { text: string }).text)).sort(),
		).toEqual(['First child done.', 'Second child done.']);
	});

	it('recursively resumes an interrupted grandchild task through the resumed child', async () => {
		const provider = createProvider();
		const model = `${provider.getModel().provider}/reviewer`;
		const { tool: gate, reached } = gateBarrier(1);
		provider.setResponses([
			fauxAssistantMessage(fauxToolCall('task', { prompt: 'Delegate down.', agent: 'reviewer' }), { stopReason: 'toolUse' }),
			fauxAssistantMessage(fauxToolCall('task', { prompt: 'Go deeper.', agent: 'deep' }), { stopReason: 'toolUse' }),
			fauxAssistantMessage(fauxToolCall('gate', {}), { stopReason: 'toolUse' }),
			fauxAssistantMessage('Grandchild done.'),
			fauxAssistantMessage('Child done.'),
			fauxAssistantMessage('Parent done.'),
		]);
		const agent = defineAgent(() => ({
			model,
			subagents: [
				{ name: 'reviewer', model, subagents: [{ name: 'deep', model, tools: [gate] }] },
			],
		}));

		const store = new InMemoryConversationStreamStore();
		const attachments = new InMemoryAttachmentStore();
		const writer = await makeWriter(store, 'producer-1');

		const harness1 = await makeHarness(provider, writer, attachments, agent);
		const internal1 = getInternalSession(await harness1.session());
		if (!internal1) throw new Error('Expected internal session.');
		const parentConversationId = internal1.conversationId;
		void internal1.processSubmissionInput(directInput('submission-parent', 'Delegate.')).catch(() => {});
		await reached;
		await writer.flush();

		const harness2 = await makeHarness(provider, writer, attachments, agent);
		const internal2 = getInternalSession(await harness2.session());
		if (!internal2) throw new Error('Expected internal session after restart.');
		await internal2.processSubmissionInput(
			directInput('submission-parent', 'Delegate.'),
		);

		expect(assistantText(await writer.getConversation(parentConversationId))).toContain('Parent done.');
		const parent = await writer.getConversation(parentConversationId);
		expect(taskOutcomes(parent)[0]?.content).toEqual([{ type: 'text', text: 'Child done.' }]);
	});

	it('writes a degraded error outcome when the subagent is no longer declared after restart', async () => {
		const provider = createProvider();
		const model = `${provider.getModel().provider}/reviewer`;
		const { tool: gate, reached } = gateBarrier(1);
		provider.setResponses([
			fauxAssistantMessage(fauxToolCall('task', { prompt: 'Do the work.', agent: 'reviewer' }), { stopReason: 'toolUse' }),
			fauxAssistantMessage(fauxToolCall('gate', {}), { stopReason: 'toolUse' }),
			fauxAssistantMessage('Parent continued despite the missing subagent.'),
		]);
		const withSubagent = defineAgent(() => ({
			model,
			subagents: [{ name: 'reviewer', model, tools: [gate] }],
		}));
		// Restart deploys a config where `reviewer` no longer exists.
		const withoutSubagent = defineAgent(() => ({ model, subagents: [] }));

		const store = new InMemoryConversationStreamStore();
		const attachments = new InMemoryAttachmentStore();
		const writer = await makeWriter(store, 'producer-1');

		const harness1 = await makeHarness(provider, writer, attachments, withSubagent);
		const internal1 = getInternalSession(await harness1.session());
		if (!internal1) throw new Error('Expected internal session.');
		const parentConversationId = internal1.conversationId;
		void internal1.processSubmissionInput(directInput('submission-parent', 'Delegate.')).catch(() => {});
		await reached;
		await writer.flush();

		const harness2 = await makeHarness(provider, writer, attachments, withoutSubagent);
		const internal2 = getInternalSession(await harness2.session());
		if (!internal2) throw new Error('Expected internal session after restart.');
		await internal2.processSubmissionInput(
			directInput('submission-parent', 'Delegate.'),
		);

		expect(assistantText(await writer.getConversation(parentConversationId))).toContain('Parent continued despite the missing subagent.');
		const resolved = taskOutcomes(await writer.getConversation(parentConversationId));
		expect(resolved[0]?.isError).toBe(true);
		expect(JSON.parse((resolved[0]?.content[0] as { text: string }).text)).toMatchObject({
			type: 'subagent_unavailable',
		});
	});

	it('continues the same child without duplication when the recovery itself is interrupted', async () => {
		const provider = createProvider();
		const model = `${provider.getModel().provider}/reviewer`;
		const first = gateBarrier(1);
		const second = gateBarrier(1);
		provider.setResponses([
			fauxAssistantMessage(fauxToolCall('task', { prompt: 'Do the work.', agent: 'reviewer' }), { stopReason: 'toolUse' }),
			// Phase 1: child parks at the first gate.
			fauxAssistantMessage(fauxToolCall('gate_a', {}), { stopReason: 'toolUse' }),
			// Phase 2 (recovery): child resumes, then parks again at a second gate.
			fauxAssistantMessage(fauxToolCall('gate_b', {}), { stopReason: 'toolUse' }),
			// Phase 3 (recovery again): child finally completes.
			fauxAssistantMessage('Child finished after two interruptions.'),
			fauxAssistantMessage('Parent done.'),
		]);
		const gateA = { ...first.tool, name: 'gate_a' };
		const gateB = { ...second.tool, name: 'gate_b' };
		const agent = defineAgent(() => ({
			model,
			subagents: [{ name: 'reviewer', model, tools: [gateA, gateB] }],
		}));

		const store = new InMemoryConversationStreamStore();
		const attachments = new InMemoryAttachmentStore();
		const writer = await makeWriter(store, 'producer-1');

		const harness1 = await makeHarness(provider, writer, attachments, agent);
		const internal1 = getInternalSession(await harness1.session());
		if (!internal1) throw new Error('Expected internal session.');
		const parentConversationId = internal1.conversationId;
		void internal1.processSubmissionInput(directInput('submission-parent', 'Delegate.')).catch(() => {});
		await first.reached;
		await writer.flush();
		const childCountAfterPhase1 = [
			...((await writer.getConversation(parentConversationId))?.childConversations.values() ?? []),
		].length;

		// Phase 2: recovery resumes the child but is itself interrupted at gate_b.
		const harness2 = await makeHarness(provider, writer, attachments, agent);
		const internal2 = getInternalSession(await harness2.session());
		if (!internal2) throw new Error('Expected internal session.');
		void internal2.processSubmissionInput(directInput('submission-parent', 'Delegate.')).catch(() => {});
		await second.reached;
		await writer.flush();

		// Phase 3: recovery completes.
		const harness3 = await makeHarness(provider, writer, attachments, agent);
		const internal3 = getInternalSession(await harness3.session());
		if (!internal3) throw new Error('Expected internal session.');
		await internal3.processSubmissionInput(
			directInput('submission-parent', 'Delegate.'),
		);

		expect(assistantText(await writer.getConversation(parentConversationId))).toContain('Parent done.');
		const parent = await writer.getConversation(parentConversationId);
		// Same child throughout — no duplicate child conversation was created.
		expect([...(parent?.childConversations.values() ?? [])]).toHaveLength(childCountAfterPhase1);
		const resolved = taskOutcomes(parent);
		expect(resolved).toHaveLength(1);
		expect(resolved[0]?.content).toEqual([
			{ type: 'text', text: 'Child finished after two interruptions.' },
		]);
	});

	// A subagent runs via `child.prompt()` and so leaves an interrupted stream with
	// no submission identity. The reattach path resumes it precisely (D-A) by
	// reusing the same `recoverInterruptedStream` materialization top-level agents
	// use — this asserts that materialization works without a submission attempt.
	it('materializes a child-shaped interrupted partial stream that carries no submission identity', async () => {
		const provider = createProvider();
		const store = new InMemoryConversationStreamStore();
		const writer = await makeWriter(store, 'producer-1');
		const timestamp = new Date().toISOString();
		// A durable partial stream with NO submissionId on any record — the shape a
		// crashed subagent leaves behind.
		await writer.append([
			{
				v: 1,
				id: 'record-created',
				type: 'conversation_created',
				kind: 'root',
				conversationId: 'conversation-child-shaped',
				harness: 'default',
				session: 'default',
				timestamp,
				affinityKey: 'affinity-child',
				createdAt: timestamp,
			},
			{
				v: 1,
				id: 'record-user',
				type: 'user_message',
				conversationId: 'conversation-child-shaped',
				harness: 'default',
				session: 'default',
				timestamp,
				messageId: 'entry_user',
				parentId: null,
				content: [{ type: 'text', text: 'Do the work.' }],
			},
			{
				v: 1,
				id: 'record-assistant-started',
				type: 'assistant_message_started',
				conversationId: 'conversation-child-shaped',
				harness: 'default',
				session: 'default',
				timestamp,
				messageId: 'entry_partial',
				parentId: 'entry_user',
				modelInfo: { api: 'faux', provider: provider.getModel().provider, model: 'reviewer' },
			},
			{
				v: 1,
				id: 'record-text-started',
				type: 'assistant_text_started',
				conversationId: 'conversation-child-shaped',
				harness: 'default',
				session: 'default',
				timestamp,
				messageId: 'entry_partial',
				blockId: 'block_partial',
				blockIndex: 0,
			},
			{
				v: 1,
				id: 'record-text-delta',
				type: 'assistant_text_delta',
				conversationId: 'conversation-child-shaped',
				harness: 'default',
				session: 'default',
				timestamp,
				messageId: 'entry_partial',
				blockId: 'block_partial',
				sequence: 0,
				delta: 'Partial child output',
			},
		]);
		const ctx = createBapxContext({
			id: INSTANCE,
			env: {},
			agentConfig: { resolveModel: () => provider.getModel('reviewer') },
			createDefaultEnv: async () => createNoopSessionEnv(),
			conversationWriter: writer,
			attachmentStore: new InMemoryAttachmentStore(),
		});
		const harness = await ctx.initializeRootHarness(
			defineAgent(() => ({ model: `${provider.getModel().provider}/reviewer` })),
		);
		const internal = getInternalSession(await harness.session());
		if (!internal) throw new Error('Expected internal session.');

		// No submission attempt — the subagent reattach path.
		expect(await internal.recoverInterruptedStream()).toBe(true);
		// Idempotent: a second materialization is a no-op (already committed).
		const offset = writer.offset;
		expect(await internal.recoverInterruptedStream()).toBe(true);
		expect(writer.offset).toBe(offset);
		// The partial text is preserved (continued), not discarded.
		expect(assistantText(await writer.getConversation('conversation-child-shaped'))).toContain(
			'Partial child output',
		);
	});
});
