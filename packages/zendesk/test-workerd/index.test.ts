import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createZendeskChannel, type ZendeskChannel } from '../src/index.ts';

const encoder = new TextEncoder();
const SIGNING_SECRET = 'bapX-zendesk-workerd-signing-secret';
const ACCOUNT_ID = '9223372036854775807';
const WEBHOOK_ID = 'workerd-webhook-29';
const TIMESTAMP = '2026-06-13T23:58:31Z';

describe('@bapX/zendesk workerd ingress', () => {
	it('verifies exact bytes and preserves unsafe identifiers when running under nodejs_compat', async () => {
		const nodeGlobals = globalThis as typeof globalThis & {
			Buffer?: { from(value: string): { toString(encoding: string): string } };
			process?: { versions?: { node?: string } };
		};
		expect(nodeGlobals.process?.versions?.node).toBeDefined();
		expect(nodeGlobals.Buffer?.from('zendesk').toString('base64')).toBe('emVuZGVzaw==');

		const webhook = vi.fn();
		const app = channelApp(
			createZendeskChannel({
				signingSecret: SIGNING_SECRET,
				accountId: ACCOUNT_ID,
				webhookId: WEBHOOK_ID,
				webhook,
			}),
		);
		const body = ` {\n "account_id": ${ACCOUNT_ID},\n "detail": {"id": 9007199254743001, "status": "pending"},\n "event": {"message": {"id": 9007199254743003, "body": "Worker delivery"}},\n "id": "event-worker-29",\n "subject": "zen:ticket:9007199254743001",\n "time": "2026-06-13T23:58:30.500Z",\n "type": "zen:event-type:ticket.messaging.message_created",\n "zendesk_event_version": "2026-05-01"\n} `;
		const headers = await signedHeaders(body, 'invocation-worker-29');

		const response = await app.request(request(body, headers));
		const changed = await app.request(
			request(body.replace('Worker delivery', 'Changed delivery'), headers),
		);

		expect(response.status).toBe(200);
		expect(changed.status).toBe(401);
		expect(webhook).toHaveBeenCalledOnce();
		expect(webhook.mock.calls[0]?.[0].delivery).toMatchObject({
			webhookId: WEBHOOK_ID,
			invocationId: 'invocation-worker-29',
		});
		expect(webhook.mock.calls[0]?.[0].payload).toMatchObject({
			account_id: ACCOUNT_ID,
			id: 'event-worker-29',
			type: 'zen:event-type:ticket.messaging.message_created',
			detail: { id: '9007199254743001', status: 'pending' },
			event: {
				message: {
					id: '9007199254743003',
					body: 'Worker delivery',
				},
			},
		});
	});

	it('rejects mismatched account identity when running in workerd', async () => {
		const webhook = vi.fn();
		const app = channelApp(
			createZendeskChannel({
				signingSecret: SIGNING_SECRET,
				webhook,
			}),
		);
		const body = eventBody();
		const headers = await signedHeaders(body, 'invocation-worker-mismatch');

		const response = await app.request(
			request(body, {
				...headers,
				'x-zendesk-account-id': '9223372036854775806',
			}),
		);

		expect(response.status).toBe(403);
		expect(webhook).not.toHaveBeenCalled();
	});

	it('enforces streamed limits and canonical ticket identity when running in workerd', async () => {
		const webhook = vi.fn();
		const zendesk = createZendeskChannel({
			signingSecret: SIGNING_SECRET,
			bodyLimit: 128,
			webhook,
		});
		const app = channelApp(zendesk);
		const body = JSON.stringify({ value: 'x'.repeat(180) });
		const headers = await signedHeaders(body, 'invocation-worker-limit');
		const bytes = encoder.encode(body);
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(bytes.slice(0, 80));
				controller.enqueue(bytes.slice(80));
				controller.close();
			},
		});

		const response = await app.request(
			new Request('https://example.test/webhook', {
				method: 'POST',
				headers: { 'content-type': 'application/json', ...headers },
				body: stream,
				duplex: 'half',
			} as RequestInit),
		);
		const ref = {
			accountId: ACCOUNT_ID,
			ticketId: '9007199254743001',
		};

		expect(response.status).toBe(413);
		expect(webhook).not.toHaveBeenCalled();
		expect(zendesk.parseTicketKey(zendesk.ticketKey(ref))).toEqual(ref);
	});
});

function channelApp(channel: ZendeskChannel): Hono {
	const app = new Hono();
	for (const route of channel.routes) app.on(route.method, route.path, route.handler);
	return app;
}

function eventBody(): string {
	return `{"account_id":${ACCOUNT_ID},"detail":{"id":7123498765},"event":{"current":"open"},"id":"event-worker-default","subject":"zen:ticket:7123498765","time":"2026-06-13T23:58:30.500Z","type":"zen:event-type:ticket.created","zendesk_event_version":"2026-05-01"}`;
}

function request(body: string, headers: Record<string, string>): Request {
	return new Request('https://example.test/webhook', {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...headers },
		body,
	});
}

async function signedHeaders(body: string, invocationId: string): Promise<Record<string, string>> {
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(SIGNING_SECRET),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	);
	const timestamp = encoder.encode(TIMESTAMP);
	const bodyBytes = encoder.encode(body);
	const signed = new Uint8Array(timestamp.byteLength + bodyBytes.byteLength);
	signed.set(timestamp);
	signed.set(bodyBytes, timestamp.byteLength);
	const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, copyArrayBuffer(signed)));
	return {
		'x-zendesk-account-id': ACCOUNT_ID,
		'x-zendesk-webhook-id': WEBHOOK_ID,
		'x-zendesk-webhook-invocation-id': invocationId,
		'x-zendesk-webhook-signature-timestamp': TIMESTAMP,
		'x-zendesk-webhook-signature': base64(signature),
	};
}

function base64(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

function copyArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	const copy = new Uint8Array(bytes.byteLength);
	copy.set(bytes);
	return copy.buffer;
}
