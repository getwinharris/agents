import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createGitHubChannel } from '../src/index.ts';

const encoder = new TextEncoder();

describe('@bapX/github workerd ingress', () => {
	it('verifies exact webhook bytes through the discovered route handler shape', async () => {
		const webhook = vi.fn();
		const github = createGitHubChannel({ webhookSecret: 'secret', webhook });
		const app = new Hono();
		for (const route of github.routes) app.on(route.method, route.path, route.handler);
		const body = ` {\n "action":"opened",\n "repository":{"id":12,"name":"widgets","owner":{"login":"acme"}},\n "sender":{"id":77,"login":"octo-reviewer","type":"User"},\n "issue":{"number":42,"title":"Unicode café","body":null}\n} `;
		const signature = await hmac('secret', body);
		const headers = {
			'content-type': 'application/json',
			'x-github-delivery': 'delivery-1',
			'x-github-event': 'issues',
			'x-hub-signature-256': `sha256=${signature}`,
		};

		const response = await app.request(
			new Request('https://example.test/webhook?source=workerd', {
				method: 'POST',
				headers,
				body,
			}),
		);
		const changed = await app.request(
			new Request('https://example.test/webhook', {
				method: 'POST',
				headers,
				body: body.replace('café', 'cafe'),
			}),
		);

		expect(response.status).toBe(200);
		expect(changed.status).toBe(401);
		expect(webhook).toHaveBeenCalledOnce();
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
