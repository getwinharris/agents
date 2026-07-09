import {
	type FauxProviderRegistration,
	fauxAssistantMessage,
	registerFauxProvider,
} from '@earendil-works/pi-ai/compat';
import { afterEach, describe, expect, it } from 'vitest';
import { defineAgent } from '../src/agent-definition.ts';
import { InvalidRequestError, OperationFailedError } from '../src/errors.ts';
import { dispatch } from '../src/index.ts';
import {
	configureBapxRuntime,
	createBapxContext,
	type DispatchInput,
	type DispatchQueue,
} from '../src/internal.ts';
import {
	createAgentSubmissionSessionHandler,
	type AgentSubmissionInput,
} from '../src/runtime/agent-submissions.ts';
import { resetBapxRuntimeForTests } from '../src/runtime/bapX-app.ts';
import { MAX_IMAGE_DATA_LENGTH } from '../src/persisted-images.ts';
import { createNoopSessionEnv } from './fixtures/session-env.ts';
import { agentRecord, nodeRuntime } from './helpers/runtime-config.ts';

const providers: FauxProviderRegistration[] = [];

/** Minimal no-op dispatch queue stub for tests that only exercise dispatch() validation. */
function noopDispatchQueue(): DispatchQueue {
	return {
		async enqueue(input) {
			return { dispatchId: input.dispatchId, acceptedAt: input.acceptedAt };
		},
	};
}

afterEach(() => {
	resetBapxRuntimeForTests();
	for (const provider of providers.splice(0)) provider.unregister();
});

function createProvider(): FauxProviderRegistration {
	const provider = registerFauxProvider({ provider: `dispatch-test-${crypto.randomUUID()}` });
	providers.push(provider);
	return provider;
}

describe('dispatch()', () => {
	it('rejects calls when the runtime has not been configured', async () => {
		await expect(
			dispatch({
				agent: 'moderator',
				id: 'guild:unconfigured',
				message: { kind: 'signal', type: 'flagged', body: 'report' },
			}),
		).rejects.toThrow('dispatch() called before runtime was configured');
	});

	it('returns an admission receipt when a named agent dispatch is accepted', async () => {
		configureBapxRuntime({
			...nodeRuntime(),
			dispatchQueue: noopDispatchQueue(),
			agents: [agentRecord('moderator')],
		});

		const receipt = await dispatch({
			agent: 'moderator',
			id: 'guild:admission',
			message: { kind: 'signal', type: 'flagged', body: 'report:admission' },
		});

		expect(receipt).toEqual({
			dispatchId: expect.any(String),
			acceptedAt: expect.any(String),
		});
	});

	it('resolves a discovered agent name when dispatch() receives an agent definition target', async () => {
		const moderator = defineAgent(() => ({ model: 'anthropic/claude-haiku-4-5' }));
		const admitted: DispatchInput[] = [];
		configureBapxRuntime({
			...nodeRuntime(),
			dispatchQueue: {
				async enqueue(input) {
					admitted.push(input);
					return { dispatchId: input.dispatchId, acceptedAt: input.acceptedAt };
				},
			},
			agents: [agentRecord('moderator', { definition: moderator })],
		});

		await dispatch(moderator, {
			id: 'guild:created',
			message: { kind: 'signal', type: 'flagged', body: 'report:created' },
		});

		expect(admitted).toMatchObject([
			{
				agent: 'moderator',
				id: 'guild:created',
				message: { kind: 'signal', type: 'flagged', body: 'report:created' },
			},
		]);
	});

	it('rejects an agent definition target when the built application cannot resolve its identity', async () => {
		const localModerator = defineAgent(() => ({ model: 'anthropic/claude-haiku-4-5' }));
		configureBapxRuntime({
			...nodeRuntime(),
			dispatchQueue: noopDispatchQueue(),
			agents: [agentRecord('moderator')],
		});

		await expect(
			dispatch(localModerator, {
				id: 'guild:local',
				message: { kind: 'signal', type: 'flagged', body: 'report:local' },
			}),
		).rejects.toThrow('not a discovered default-exported agent');
	});

	it('snapshots the delivered message when dispatch() admits a payload', async () => {
		const admitted: DispatchInput[] = [];
		const attributes: Record<string, string> = { reportId: 'report:snapshot' };
		configureBapxRuntime({
			...nodeRuntime(),
			dispatchQueue: {
				async enqueue(input) {
					admitted.push(input);
					return { dispatchId: input.dispatchId, acceptedAt: input.acceptedAt };
				},
			},
			agents: [agentRecord('moderator')],
		});

		await dispatch({
			agent: 'moderator',
			id: 'guild:snapshot',
			message: { kind: 'signal', type: 'flagged', body: 'report', attributes },
		});
		attributes.reportId = 'mutated-after-dispatch';

		expect(admitted[0]?.message).toEqual({
			kind: 'signal',
			type: 'flagged',
			body: 'report',
			attributes: { reportId: 'report:snapshot' },
		});
	});

	it('resolves a dispatched user message with attachments through the same validated path', async () => {
		const admitted: DispatchInput[] = [];
		configureBapxRuntime({
			...nodeRuntime(),
			dispatchQueue: {
				async enqueue(input) {
					admitted.push(input);
					return { dispatchId: input.dispatchId, acceptedAt: input.acceptedAt };
				},
			},
			agents: [agentRecord('moderator')],
		});

		await dispatch({
			agent: 'moderator',
			id: 'guild:attachment',
			message: {
				kind: 'user',
				body: 'Here is the screenshot.',
				attachments: [{ type: 'image', data: 'YWJj', mimeType: 'image/png' }],
			},
		});

		expect(admitted[0]?.message).toEqual({
			kind: 'user',
			body: 'Here is the screenshot.',
			attachments: [{ type: 'image', data: 'YWJj', mimeType: 'image/png' }],
		});
	});

	it('rejects a missing message when dispatch() receives no message field', async () => {
		configureBapxRuntime({
			...nodeRuntime(),
			dispatchQueue: noopDispatchQueue(),
			agents: [agentRecord('moderator')],
		});

		const error = await dispatch({
			agent: 'moderator',
			id: 'guild:undefined-message',
			message: undefined as any,
		}).catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(InvalidRequestError);
	});

	it('rejects a message with an unrecognized kind', async () => {
		configureBapxRuntime({
			...nodeRuntime(),
			dispatchQueue: noopDispatchQueue(),
			agents: [agentRecord('moderator')],
		});

		const error = await dispatch({
			agent: 'moderator',
			id: 'guild:bad-kind',
			message: { kind: 'bogus', body: 'x' } as any,
		}).catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(InvalidRequestError);
	});

	it('rejects a signal message missing its type', async () => {
		configureBapxRuntime({
			...nodeRuntime(),
			dispatchQueue: noopDispatchQueue(),
			agents: [agentRecord('moderator')],
		});

		const error = await dispatch({
			agent: 'moderator',
			id: 'guild:missing-type',
			message: { kind: 'signal', body: 'x' } as any,
		}).catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(InvalidRequestError);
	});

	it('rejects a signal tagName that is not a valid XML tag name', async () => {
		configureBapxRuntime({
			...nodeRuntime(),
			dispatchQueue: noopDispatchQueue(),
			agents: [agentRecord('moderator')],
		});

		// tagName is rendered unescaped as the signal's model-context envelope,
		// so markup and empty strings must be rejected at admission.
		for (const tagName of ['bad><system', 'a b', '', '1st', '-x', '.x']) {
			const error = await dispatch({
				agent: 'moderator',
				id: 'guild:bad-tag-name',
				message: { kind: 'signal', type: 'flagged', body: 'report', tagName },
			}).catch((caught: unknown) => caught);

			expect(error, `tagName ${JSON.stringify(tagName)}`).toBeInstanceOf(InvalidRequestError);
			expect((error as InvalidRequestError).details).toContain(
				'Signal message "tagName" must be a valid XML tag name',
			);
		}
	});

	it('accepts a valid custom signal tagName', async () => {
		const admitted: DispatchInput[] = [];
		configureBapxRuntime({
			...nodeRuntime(),
			dispatchQueue: {
				async enqueue(input) {
					admitted.push(input);
					return { dispatchId: input.dispatchId, acceptedAt: input.acceptedAt };
				},
			},
			agents: [agentRecord('moderator')],
		});

		await dispatch({
			agent: 'moderator',
			id: 'guild:custom-tag-name',
			message: { kind: 'signal', type: 'flagged', body: 'report', tagName: 'slack-message' },
		});

		expect(admitted[0]?.message).toEqual({
			kind: 'signal',
			type: 'flagged',
			body: 'report',
			tagName: 'slack-message',
		});
	});

	it('rejects a user message attachment above the encoded length limit', async () => {
		configureBapxRuntime({
			...nodeRuntime(),
			dispatchQueue: noopDispatchQueue(),
			agents: [agentRecord('moderator')],
		});

		const error = await dispatch({
			agent: 'moderator',
			id: 'guild:oversized-attachment',
			message: {
				kind: 'user',
				body: 'Here is the screenshot.',
				attachments: [
					{ type: 'image', data: 'a'.repeat(MAX_IMAGE_DATA_LENGTH + 1), mimeType: 'image/png' },
				],
			},
		}).catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(InvalidRequestError);
		expect((error as InvalidRequestError).details).toBe(
			`Image data exceeds the ${MAX_IMAGE_DATA_LENGTH} character limit.`,
		);
	});

	it('rejects an unknown agent when dispatch() targets an unregistered name', async () => {
		configureBapxRuntime({
			...nodeRuntime(),
			dispatchQueue: noopDispatchQueue(),
			agents: [agentRecord('moderator')],
		});

		await expect(
			dispatch({
				agent: 'missing',
				id: 'guild:unknown-agent',
				message: { kind: 'signal', type: 'flagged', body: 'report' },
			}),
		).rejects.toThrow('target agent "missing" is not registered');
	});

	it('rejects a blank agent instance id when dispatch() receives an id', async () => {
		configureBapxRuntime({
			...nodeRuntime(),
			dispatchQueue: noopDispatchQueue(),
			agents: [agentRecord('moderator')],
		});

		await expect(
			dispatch({
				agent: 'moderator',
				id: '  ',
				message: { kind: 'signal', type: 'flagged', body: 'report' },
			}),
		).rejects.toThrow('requires a non-empty "id" target agent instance id');
	});
});

describe('dispatched session processing', () => {
	it('rejects the operation when a turn ends aborted', async () => {
		const provider = createProvider();
		provider.setResponses([
			fauxAssistantMessage('partial output collected before the abort', {
				stopReason: 'aborted',
				errorMessage: 'Request was aborted',
			}),
		]);
		const agent = defineAgent(() => ({
			model: `${provider.getModel().provider}/${provider.getModel().id}`,
		}));
		const input: AgentSubmissionInput = {
			kind: 'direct',
			submissionId: 'direct:aborted-turn',
			agent: 'moderator',
			id: 'guild:aborted-turn',
			message: { kind: 'user', body: 'Hello directly' },
			acceptedAt: '2026-06-01T00:00:00.000Z',
		};
		const ctx = createBapxContext({
			id: input.id,
			env: {},
			req: new Request('http://bapX.local/agents/moderator/guild:aborted-turn', {
				method: 'POST',
			}),
			agentConfig: {
				subagents: {},
				resolveModel: () => provider.getModel(),
			},
			createDefaultEnv: async () => createNoopSessionEnv({ cwd: '/' }),
		});

		await expect(
			createAgentSubmissionSessionHandler(agent, input, (s) =>
				s.processSubmissionInput(input, {
					submissionAttempt: { submissionId: input.submissionId, attemptId: 'attempt-1' },
				}),
			)(ctx),
		).rejects.toBeInstanceOf(OperationFailedError);
	});

	it('rejects the operation when a turn ends with a model error', async () => {
		const provider = createProvider();
		provider.setResponses([
			fauxAssistantMessage('', { stopReason: 'error', errorMessage: 'invalid_api_key' }),
		]);
		const agent = defineAgent(() => ({
			model: `${provider.getModel().provider}/${provider.getModel().id}`,
		}));
		const input: AgentSubmissionInput = {
			kind: 'direct',
			submissionId: 'direct:error-turn',
			agent: 'moderator',
			id: 'guild:error-turn',
			message: { kind: 'user', body: 'Hello directly' },
			acceptedAt: '2026-06-01T00:00:00.000Z',
		};
		const ctx = createBapxContext({
			id: input.id,
			env: {},
			req: new Request('http://bapX.local/agents/moderator/guild:error-turn', {
				method: 'POST',
			}),
			agentConfig: {
				subagents: {},
				resolveModel: () => provider.getModel(),
			},
			createDefaultEnv: async () => createNoopSessionEnv({ cwd: '/' }),
		});

		await expect(
			createAgentSubmissionSessionHandler(agent, input, (s) =>
				s.processSubmissionInput(input, {
					submissionAttempt: { submissionId: input.submissionId, attemptId: 'attempt-1' },
				}),
			)(ctx),
		).rejects.toBeInstanceOf(OperationFailedError);
	});
});
