import { Hono } from 'hono';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import { createGoogleChatChannel } from '../src/index.ts';

describe('@bapX/google-chat workerd ingress', () => {
	it('executes wire-faithful callbacks when running in workerd', async () => {
		const audience = 'https://worker.example.test/channels/google-chat/interactions';
		const pubsubAudience = 'https://worker.example.test/channels/google-chat/events';
		const pubsubIdentity = 'push@worker-project.iam.gserviceaccount.com';
		const subscription = 'projects/worker-project/subscriptions/google-chat-events';
		const jwksUrl = 'https://keys.worker.test/google';
		const keyPair = await generateKeyPair('RS256');
		const publicJwk = await exportJWK(keyPair.publicKey);
		const fetcher = vi.fn(async () =>
			Response.json({
				keys: [{ ...publicJwk, kid: 'workerd-key', alg: 'RS256', use: 'sig' }],
			}),
		);
		const interactionPayload = {
			type: 'MESSAGE',
			space: { name: 'spaces/workerd', spaceType: 'DIRECT_MESSAGE', type: 'DM' },
			message: { text: 'workerd interaction', futureField: true },
		};
		const delivery = {
			message: {
				attributes: {
					'ce-datacontenttype': 'application/json',
					'ce-id': 'workerd-event',
					'ce-source': '//workspaceevents.googleapis.com/subscriptions/workerd',
					'ce-specversion': '1.0',
					'ce-subject': '//chat.googleapis.com/spaces/-',
					'ce-type': 'google.workspace.chat.space.v1.deleted',
				},
				data: btoa(JSON.stringify({ space: { name: 'spaces/workerd' } })),
				messageId: 'workerd-pubsub-message',
			},
			subscription,
			deliveryAttempt: 2,
		};
		const identityDelivery = {
			message: {
				attributes: {
					...delivery.message.attributes,
					'ce-id': 'workerd-identity-event',
					'ce-subject': '//cloudidentity.googleapis.com/users/123456789',
					'ce-type': 'google.workspace.identity.user.v1.updated',
				},
				data: btoa(JSON.stringify({ user: { name: 'users/123456789' } })),
				messageId: 'workerd-identity-pubsub-message',
			},
			subscription,
		};
		const interactions = vi.fn(({ payload }) => ({ surface: 'interaction', type: payload.type }));
		const workspaceEvents = vi.fn(({ delivery }) => ({
			surface: 'event',
			attempt: delivery.deliveryAttempt,
		}));
		const channel = createGoogleChatChannel({
			fetch: fetcher,
			interactions: {
				authentication: { type: 'endpoint-url', audience, jwksUrl },
				handler: interactions,
			},
			workspaceEvents: {
				authentication: {
					subscription,
					audience: pubsubAudience,
					serviceAccountEmail: pubsubIdentity,
					jwksUrl,
				},
				handler: workspaceEvents,
			},
		});
		const app = new Hono();
		for (const route of channel.routes) app.on(route.method, route.path, route.handler);
		const interactionToken = await token(
			keyPair.privateKey,
			audience,
			'chat@system.gserviceaccount.com',
		);
		const pubsubToken = await token(keyPair.privateKey, pubsubAudience, pubsubIdentity);

		const interactionResponse = await app.request('/interactions', {
			method: 'POST',
			headers: {
				authorization: `Bearer ${interactionToken}`,
				'content-type': 'application/json',
			},
			body: JSON.stringify(interactionPayload),
		});
		const eventResponse = await app.request('/events', {
			method: 'POST',
			headers: { authorization: `Bearer ${pubsubToken}`, 'content-type': 'application/json' },
			body: JSON.stringify(delivery),
		});
		const identityEventResponse = await app.request('/events', {
			method: 'POST',
			headers: { authorization: `Bearer ${pubsubToken}`, 'content-type': 'application/json' },
			body: JSON.stringify(identityDelivery),
		});

		expect(interactionResponse.status).toBe(200);
		expect(await interactionResponse.json()).toEqual({ surface: 'interaction', type: 'MESSAGE' });
		expect(eventResponse.status).toBe(200);
		expect(await eventResponse.json()).toEqual({ surface: 'event', attempt: 2 });
		expect(identityEventResponse.status).toBe(200);
		expect(await identityEventResponse.json()).toEqual({ surface: 'event' });
		expect(interactions.mock.calls[0]?.[0].payload).toEqual(interactionPayload);
		expect(workspaceEvents.mock.calls.map(([input]) => input.delivery)).toEqual([
			delivery,
			identityDelivery,
		]);
		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it('rejects a malformed Workspace delivery when unauthenticated in workerd', async () => {
		const channel = createGoogleChatChannel({
			workspaceEvents: {
				authentication: {
					subscription: 'projects/worker-project/subscriptions/google-chat-events',
					audience: 'https://worker.example.test/channels/google-chat/events',
					serviceAccountEmail: 'push@worker-project.iam.gserviceaccount.com',
					jwksUrl: 'https://keys.worker.test/google',
				},
				handler: vi.fn(),
			},
		});
		const app = new Hono();
		for (const route of channel.routes) app.on(route.method, route.path, route.handler);

		const response = await app.request('/events', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ message: { data: 'not base64' } }),
		});

		expect(response.status).toBe(401);
	});
});

async function token(privateKey: CryptoKey, audience: string, email: string): Promise<string> {
	return new SignJWT({ email, email_verified: true })
		.setProtectedHeader({ alg: 'RS256', kid: 'workerd-key' })
		.setIssuer('https://accounts.google.com')
		.setAudience(audience)
		.setIssuedAt()
		.setExpirationTime('5m')
		.sign(privateKey);
}
