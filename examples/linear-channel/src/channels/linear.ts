import {
	createLinearChannel,
	type LinearConversationRef,
	type LinearWebhookPayload,
} from '@bapX/linear';
import { defineTool, dispatch } from '@bapX/runtime';
import { LinearClient } from '@linear/sdk';
import type {
	AgentSessionEventWebhookPayload,
	EntityWebhookPayloadWithCommentData,
} from '@linear/sdk/webhooks';
import * as v from 'valibot';
import assistant from '../agents/assistant.ts';

const organizationId = optionalEnv('LINEAR_ORGANIZATION_ID');
const webhookId = optionalEnv('LINEAR_WEBHOOK_ID');

export const client = new LinearClient(linearCredentials());

export const channel = createLinearChannel({
	webhookSecret: requiredEnv('LINEAR_WEBHOOK_SECRET'),
	...(organizationId === undefined ? {} : { organizationId }),
	...(webhookId === undefined ? {} : { webhookId }),

	// Path: /channels/linear/webhook
	async webhook({ payload, deliveryId }) {
		if (isCommentEvent(payload)) {
			const comment = payload.data;
			if (payload.action !== 'create' || !comment.issueId) return;
			await dispatch(assistant, {
				id: channel.conversationKey({
					type: 'issue',
					organizationId: payload.organizationId,
					issueId: comment.issueId,
					...(comment.parentId ? { threadCommentId: comment.parentId } : {}),
				}),
				message: {
					kind: 'signal',
					type: 'linear.comment.created',
					body: comment.body,
					attributes: {
						deliveryId,
						...(payload.actor ? { actorId: payload.actor.id } : {}),
						...(payload.actor && 'name' in payload.actor ? { actorName: payload.actor.name } : {}),
					},
				},
			});
			return;
		}

		if (isAgentSessionEvent(payload)) {
			await dispatch(assistant, {
				id: channel.conversationKey({
					type: 'agent-session',
					organizationId: payload.organizationId,
					agentSessionId: payload.agentSession.id,
				}),
				message: {
					kind: 'signal',
					type: `linear.agent_session.${payload.action}`,
					body: JSON.stringify({
						promptContext: payload.promptContext,
						activity: payload.agentActivity,
						session: payload.agentSession,
					}),
					attributes: { deliveryId },
				},
			});
		}
	},
});

// Narrow Linear's native union to the surfaces this app handles. The union's
// catch-all member keeps `type` widened, so a literal check alone does not
// narrow; combine it with the discriminating nested field.
function isCommentEvent(
	payload: LinearWebhookPayload,
): payload is EntityWebhookPayloadWithCommentData {
	return payload.type === 'Comment' && 'body' in payload.data;
}

function isAgentSessionEvent(
	payload: LinearWebhookPayload,
): payload is AgentSessionEventWebhookPayload {
	return payload.type === 'AgentSessionEvent' && 'agentSession' in payload;
}

export function postMessage(ref: LinearConversationRef) {
	return defineTool({
		name: 'post_linear_message',
		description: 'Post a message to the Linear conversation bound to this agent.',
		input: v.object({ text: v.pipe(v.string(), v.minLength(1)) }),
		async run({ input }) {
			const { text } = input;
			if (ref.type === 'agent-session') {
				const result = await client.createAgentActivity({
					agentSessionId: ref.agentSessionId,
					content: { type: 'response', body: text },
				});
				return { success: result.success };
			}
			const result = await client.createComment({
				issueId: ref.issueId,
				...(ref.threadCommentId === undefined ? {} : { parentId: ref.threadCommentId }),
				body: text,
			});
			return {
				success: result.success,
				...(result.commentId === undefined ? {} : { commentId: result.commentId }),
			};
		},
	});
}

function linearCredentials(): { apiKey: string } | { accessToken: string } {
	const apiKey = optionalEnv('LINEAR_API_KEY');
	const accessToken = optionalEnv('LINEAR_ACCESS_TOKEN');
	if (apiKey && accessToken) {
		throw new Error('Set LINEAR_API_KEY or LINEAR_ACCESS_TOKEN, not both.');
	}
	if (accessToken) return { accessToken };
	if (apiKey) return { apiKey };
	throw new Error('LINEAR_API_KEY or LINEAR_ACCESS_TOKEN is required.');
}

function requiredEnv(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is required.`);
	return value;
}

function optionalEnv(name: string): string | undefined {
	return process.env[name] || undefined;
}
