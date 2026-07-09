import { Hono } from 'hono';
import Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';
import { createStripeChannel, type StripeChannel } from '../src/index.ts';

const encoder = new TextEncoder();

describe('@bapX/stripe workerd ingress', () => {
	it('executes official snapshot verification over exact bytes in workerd', async () => {
		const webhook = vi.fn();
		const stripe = createStripeChannel({
			client: stripeClient(),
			webhookSecret: 'whsec_worker_snapshot',
			webhook,
		});
		const body = ` {\n "id":"evt_worker_snapshot",\n "object":"event",\n "api_version":"2026-05-27.dahlia",\n "created":1781395200,\n "data":{"object":{"id":"cus_worker","object":"customer","name":"Café North"}},\n "livemode":false,\n "pending_webhooks":1,\n "request":null,\n "type":"customer.created"\n} `;
		const header = await signatureHeader(body, 'whsec_worker_snapshot');
		const app = channelApp(stripe);

		const response = await app.request(request(body, header));
		const changed = await app.request(request(body.replace('Café North', 'Cafe North'), header));

		expect(response.status).toBe(200);
		expect(changed.status).toBe(400);
		expect(webhook).toHaveBeenCalledOnce();
		expect(webhook.mock.calls[0]?.[0].event).toMatchObject({
			id: 'evt_worker_snapshot',
			type: 'customer.created',
		});
	});

	it('executes official thin notification verification and context parsing in workerd', async () => {
		const webhook = vi.fn();
		const stripe = createStripeChannel({
			client: stripeClient(),
			webhookSecret: 'whsec_worker_thin',
			eventPayload: 'thin',
			webhook,
		});
		const body = JSON.stringify({
			id: 'evt_worker_thin',
			object: 'v2.core.event',
			context: 'acct_worker/merchant_blue',
			created: '2026-06-13T20:10:00.000Z',
			livemode: false,
			related_object: {
				id: 'acct_worker',
				type: 'v2.core.account',
				url: '/v2/core/accounts/acct_worker',
			},
			type: 'v2.core.account.updated',
		});
		const timestamp = Math.floor(Date.now() / 1000);
		const app = channelApp(stripe);

		const response = await app.request(
			request(body, await signatureHeader(body, 'whsec_worker_thin', timestamp)),
		);
		const stale = await app.request(
			request(body, await signatureHeader(body, 'whsec_worker_thin', timestamp - 301)),
		);

		expect(response.status).toBe(200);
		expect(stale.status).toBe(400);
		expect(webhook).toHaveBeenCalledOnce();
		const event = webhook.mock.calls[0]?.[0].event;
		expect(event).toMatchObject({
			id: 'evt_worker_thin',
			object: 'v2.core.event',
			type: 'v2.core.account.updated',
		});
		expect(event.context.toString()).toBe('acct_worker/merchant_blue');
		expect(event.fetchEvent).toEqual(expect.any(Function));
		expect(event.fetchRelatedObject).toEqual(expect.any(Function));
	});
});

function stripeClient(): Stripe {
	return new Stripe('sk_test_worker_channel', {
		httpClient: Stripe.createFetchHttpClient(),
	});
}

function channelApp(channel: StripeChannel): Hono {
	const app = new Hono();
	for (const route of channel.routes) app.on(route.method, route.path, route.handler);
	return app;
}

function request(body: string, stripeSignature: string): Request {
	return new Request('https://example.test/webhook', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'stripe-signature': stripeSignature,
		},
		body,
	});
}

async function signatureHeader(
	body: string,
	secret: string,
	timestamp = Math.floor(Date.now() / 1000),
): Promise<string> {
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	);
	const digest = new Uint8Array(
		await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${body}`)),
	);
	const signature = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
	return `t=${timestamp},v1=${signature}`;
}
