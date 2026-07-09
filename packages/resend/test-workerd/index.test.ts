import { Hono } from 'hono';
import { Resend } from 'resend';
import { describe, expect, it, vi } from 'vitest';
import { createResendChannel, type ResendChannel } from '../src/index.ts';

const encoder = new TextEncoder();
const SECRET_TEXT = 'flue-resend-workerd-secret';
const WEBHOOK_SECRET = `whsec_${base64(encoder.encode(SECRET_TEXT))}`;

describe('@bapX/resend workerd ingress', () => {
	it('executes the official Resend verifier over exact bytes in workerd', async () => {
		const webhook = vi.fn();
		const app = channelApp(
			createResendChannel({
				client: new Resend('re_workerd_ingress'),
				webhookSecret: WEBHOOK_SECRET,
				webhook,
			}),
		);
		const body = ` {\n "type":"email.received",\n "created_at":"2026-06-13T23:00:00.000Z",\n "data":{"email_id":"email_worker_1","created_at":"2026-06-13T22:59:59.000Z","from":"customer@example.test","to":["support@example.test"],"bcc":[],"cc":[],"message_id":"<worker-message@example.test>","subject":"Worker request","attachments":[]}\n} `;
		const headers = await signedHeaders(body, 'msg_worker_exact');

		const response = await app.request(request(body, headers));
		const tampered = await app.request(
			request(body.replace('Worker request', 'Changed request'), headers),
		);

		expect(response.status).toBe(200);
		expect(tampered.status).toBe(400);
		expect(webhook).toHaveBeenCalledOnce();
		expect(webhook.mock.calls[0]?.[0]).toMatchObject({
			event: {
				type: 'email.received',
				data: { email_id: 'email_worker_1' },
			},
			delivery: { id: 'msg_worker_exact' },
		});
		expect(globalThis.process).toBeDefined();
		expect(globalThis.Buffer).toBeDefined();
	});

	it('forwards a future verified event with its native payload in workerd', async () => {
		const webhook = vi.fn();
		const app = channelApp(
			createResendChannel({
				client: new Resend('re_workerd_future'),
				webhookSecret: WEBHOOK_SECRET,
				webhook,
			}),
		);
		const body = JSON.stringify({
			type: 'domain.expiring',
			created_at: '2026-06-13T23:05:00.000Z',
			data: { id: 'domain_worker_1', days_remaining: 14 },
		});

		const response = await app.request(
			request(body, await signedHeaders(body, 'msg_worker_future')),
		);

		expect(response.status).toBe(200);
		expect(webhook.mock.calls[0]?.[0].event).toMatchObject({
			type: 'domain.expiring',
			created_at: '2026-06-13T23:05:00.000Z',
			data: { id: 'domain_worker_1', days_remaining: 14 },
		});
		expect(crypto.subtle).toBeDefined();
	});
});

function channelApp(channel: ResendChannel): Hono {
	const app = new Hono();
	for (const route of channel.routes) app.on(route.method, route.path, route.handler);
	return app;
}

function request(body: string, headers: Record<string, string>): Request {
	return new Request('https://example.test/webhook', {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...headers },
		body,
	});
}

async function signedHeaders(body: string, id: string): Promise<Record<string, string>> {
	const timestamp = Math.floor(Date.now() / 1000);
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(SECRET_TEXT),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	);
	const signature = new Uint8Array(
		await crypto.subtle.sign('HMAC', key, encoder.encode(`${id}.${timestamp}.${body}`)),
	);
	return {
		'svix-id': id,
		'svix-timestamp': String(timestamp),
		'svix-signature': `v1,${base64(signature)}`,
	};
}

function base64(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}
