import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createLinearChannel } from '../src/index.ts';

const encoder = new TextEncoder();

describe('@bapX/linear workerd ingress', () => {
	it('verifies exact webhook bytes and forwards native agent-session payloads in workerd', async () => {
		const webhook = vi.fn();
		const linear = createLinearChannel({ webhookSecret: 'worker-secret', webhook });
		const app = new Hono();
		for (const route of linear.routes) app.on(route.method, route.path, route.handler);
		const body = ` {\n  "action":"prompted",\n  "type":"AgentSessionEvent",\n  "organizationId":"org-worker",\n  "webhookId":"hook-worker",\n  "webhookTimestamp":${Date.now()},\n  "createdAt":"2026-06-13T18:00:00.000Z",\n  "appUserId":"app-user-worker",\n  "oauthClientId":"oauth-worker",\n  "agentSession":{"id":"session-worker","appUserId":"app-user-worker","organizationId":"org-worker","status":"active","createdAt":"2026-06-13T18:00:00.000Z","updatedAt":"2026-06-13T18:00:00.000Z","type":"issue"},\n  "agentActivity":{"id":"activity-worker","agentSessionId":"session-worker","userId":"user-worker","content":{"type":"prompt","body":"Check the Worker route."}},\n  "previousComments":[],\n  "guidance":[]\n} `;
		const signature = await hmac('worker-secret', body);
		const headers = {
			'content-type': 'application/json',
			'linear-signature': signature,
			'linear-delivery': 'f36065f1-60c5-40e5-aef3-eaf3e734383f',
		};

		const response = await app.request(
			new Request('https://example.test/webhook', { method: 'POST', headers, body }),
		);
		const changed = await app.request(
			new Request('https://example.test/webhook', {
				method: 'POST',
				headers,
				body: body.replace('Worker route', 'Node route'),
			}),
		);
		const invalidDelivery = await app.request(
			new Request('https://example.test/webhook', {
				method: 'POST',
				headers: { ...headers, 'linear-delivery': 'delivery-worker' },
				body,
			}),
		);

		expect(response.status).toBe(200);
		expect(changed.status).toBe(401);
		expect(invalidDelivery.status).toBe(400);
		expect(webhook).toHaveBeenCalledOnce();
		const input = webhook.mock.calls[0]?.[0];
		expect(input.deliveryId).toBe('f36065f1-60c5-40e5-aef3-eaf3e734383f');
		expect(input.payload).toMatchObject({
			type: 'AgentSessionEvent',
			action: 'prompted',
			organizationId: 'org-worker',
			agentSession: { id: 'session-worker', organizationId: 'org-worker' },
			agentActivity: { id: 'activity-worker', agentSessionId: 'session-worker' },
		});
	});
});

async function hmac(secret: string, body: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	);
	const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(body)));
	return Array.from(signature, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
