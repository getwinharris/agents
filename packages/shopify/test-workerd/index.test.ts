import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createShopifyChannel, type ShopifyChannel } from '../src/index.ts';

const encoder = new TextEncoder();
const CURRENT_SECRET = 'bapX-shopify-workerd-current';
const PREVIOUS_SECRET = 'bapX-shopify-workerd-previous';

describe('@bapX/shopify workerd ingress', () => {
	it('verifies exact bytes with Web Crypto in workerd', async () => {
		const webhook = vi.fn();
		const app = channelApp(
			createShopifyChannel({
				clientSecret: CURRENT_SECRET,
				webhook,
			}),
		);
		const body = ` {\n "id": 814309,\n "customer_id": 9007199254741999,\n "title": "Workerd order"\n} `;
		const headers = await signedHeaders(body, CURRENT_SECRET, 'orders/create', 'worker-current');

		const response = await app.request(request(body, headers));
		const tampered = await app.request(
			request(body.replace('Workerd order', 'Changed order'), headers),
		);

		expect(response.status).toBe(200);
		expect(tampered.status).toBe(401);
		const input = webhook.mock.calls[0]?.[0];
		expect(input).toMatchObject({
			payload: {
				id: 814309,
				customer_id: '9007199254741999',
				title: 'Workerd order',
			},
			rawBody: body,
		});
		expect(input.c.req.header('x-shopify-topic')).toBe('orders/create');
		expect(input.c.req.header('x-shopify-webhook-id')).toBe('worker-current');
		expect(globalThis.process).toBeDefined();
		expect(globalThis.Buffer).toBeDefined();
		expect(crypto.subtle).toBeDefined();
	});

	it('accepts a rotated previous secret and preserves an unknown topic in workerd', async () => {
		const webhook = vi.fn();
		const app = channelApp(
			createShopifyChannel({
				clientSecret: CURRENT_SECRET,
				previousClientSecret: PREVIOUS_SECRET,
				webhook,
			}),
		);
		const body = JSON.stringify({ future_resource: { id: 'gid://shopify/Future/17' } });

		const response = await app.request(
			request(
				body,
				await signedHeaders(body, PREVIOUS_SECRET, 'future_resources/created', 'worker-previous'),
			),
		);

		expect(response.status).toBe(200);
		const input = webhook.mock.calls[0]?.[0];
		expect(input).toMatchObject({
			payload: { future_resource: { id: 'gid://shopify/Future/17' } },
		});
		expect(input.c.req.header('x-shopify-topic')).toBe('future_resources/created');
	});

	it('enforces streamed body limits in workerd', async () => {
		const webhook = vi.fn();
		const app = channelApp(
			createShopifyChannel({
				clientSecret: CURRENT_SECRET,
				bodyLimit: 64,
				webhook,
			}),
		);
		const body = JSON.stringify({ value: 'x'.repeat(80) });
		const headers = await signedHeaders(
			body,
			CURRENT_SECRET,
			'future_resources/created',
			'worker-stream-limit',
		);

		const response = await app.request(streamingRequest(body, headers));

		expect(response.status).toBe(413);
		expect(webhook).not.toHaveBeenCalled();
	});
});

function channelApp(channel: ShopifyChannel): Hono {
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

function streamingRequest(body: string, headers: Record<string, string>): Request {
	const bytes = encoder.encode(body);
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(bytes.slice(0, 48));
			controller.enqueue(bytes.slice(48));
			controller.close();
		},
	});
	return new Request('https://example.test/webhook', {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...headers },
		body: stream,
		duplex: 'half',
	} as RequestInit);
}

async function signedHeaders(
	body: string,
	secret: string,
	topic: string,
	webhookId: string,
): Promise<Record<string, string>> {
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	);
	const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(body)));
	return {
		'x-shopify-hmac-sha256': base64(signature),
		'x-shopify-topic': topic,
		'x-shopify-shop-domain': 'workerd-fixtures.myshopify.com',
		'x-shopify-api-version': '2026-04',
		'x-shopify-webhook-id': webhookId,
	};
}

function base64(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}
