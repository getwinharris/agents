import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createIntercomChannel } from '../src/index.ts';

const encoder = new TextEncoder();
const CLIENT_SECRET = 'bapX-intercom-workerd-secret';

describe('@bapX/intercom workerd ingress', () => {
	it('verifies exact bytes and preserves a future topic when running in workerd', async () => {
		const webhook = vi.fn();
		const intercom = createIntercomChannel({
			clientSecret: CLIENT_SECRET,
			webhook,
		});
		const app = new Hono();
		mountChannel(app, intercom);
		const body = ` {\n "type":"notification_event",\n "topic":"conversation.ai_agent.reviewed",\n "id":"notif-worker-29",\n "app_id":"workspace-worker",\n "created_at":1781393201,\n "delivery_attempts":1,\n "first_sent_at":1781393202,\n "data":{"item":{"type":"conversation","id":"conversation-worker"}}\n} `;
		const signature = await hmac(body);
		const headers = {
			'content-type': 'application/json',
			'x-hub-signature': `sha1=${signature}`,
		};

		const response = await app.request(
			new Request('https://example.test/webhook', {
				method: 'POST',
				headers,
				body,
			}),
		);
		const changed = await app.request(
			new Request('https://example.test/webhook', {
				method: 'POST',
				headers,
				body: body.replace('conversation-worker', 'conversation-changed'),
			}),
		);

		expect(response.status).toBe(200);
		expect(changed.status).toBe(401);
		expect(webhook).toHaveBeenCalledOnce();
		expect(webhook.mock.calls[0]?.[0].notification).toMatchObject({
			topic: 'conversation.ai_agent.reviewed',
			app_id: 'workspace-worker',
			id: 'notif-worker-29',
			data: {
				item: {
					type: 'conversation',
					id: 'conversation-worker',
				},
			},
		});
	});

	it('acknowledges HEAD and enforces streamed limits when running in workerd', async () => {
		const webhook = vi.fn();
		const intercom = createIntercomChannel({
			clientSecret: CLIENT_SECRET,
			bodyLimit: 128,
			webhook,
		});
		const app = new Hono();
		mountChannel(app, intercom);
		const body = JSON.stringify({ value: 'x'.repeat(160) });
		const signature = await hmac(body);
		const bytes = encoder.encode(body);
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(bytes.slice(0, 80));
				controller.enqueue(bytes.slice(80));
				controller.close();
			},
		});

		const validation = await app.request(
			new Request('https://example.test/webhook', { method: 'HEAD' }),
		);
		const oversized = await app.request(
			new Request('https://example.test/webhook', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'x-hub-signature': `sha1=${signature}`,
				},
				body: stream,
				duplex: 'half',
			} as RequestInit),
		);

		expect(validation.status).toBe(200);
		expect(oversized.status).toBe(413);
		expect(webhook).not.toHaveBeenCalled();
	});
});

function mountChannel(app: Hono, intercom: ReturnType<typeof createIntercomChannel>): void {
	app.all('/webhook', (c) => {
		const route = intercom.routes.find(
			(candidate) => candidate.method === c.req.method && candidate.path === '/webhook',
		);
		return route ? route.handler(c, async () => {}) : new Response(null, { status: 405 });
	});
}

async function hmac(body: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(CLIENT_SECRET),
		{ name: 'HMAC', hash: 'SHA-1' },
		false,
		['sign'],
	);
	const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(body)));
	return Array.from(signature, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
