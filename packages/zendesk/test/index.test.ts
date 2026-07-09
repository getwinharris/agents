import { Hono } from 'hono';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
	createZendeskChannel,
	InvalidZendeskInputError,
	InvalidZendeskTicketKeyError,
	type ZendeskChannel,
	type ZendeskWebhookHandlerInput,
} from '../src/index.ts';

const encoder = new TextEncoder();
const SIGNING_SECRET = 'bapX-zendesk-node-signing-secret';
const ACCOUNT_ID = '9223372036854775807';
const WEBHOOK_ID = '01JZF1K8VZ4K69KR9S72AM1TCD';
const TIMESTAMP = '2026-06-13T23:52:17Z';

describe('createZendeskChannel()', () => {
	it('delivers a typed event when the timestamp and exact request bytes match', async () => {
		const webhook = vi.fn();
		const app = channelApp(
			createZendeskChannel({
				signingSecret: SIGNING_SECRET,
				webhook,
			}),
		);
		const body = ` {\n "account_id": ${ACCOUNT_ID},\n "detail": {"id": 9007199254741997, "status": "open", "actor_id": 44881},\n "event": {"current": "open", "previous": "new", "sequence": {"id": 9007199254741999, "position": 2}},\n "id": "event-node-17",\n "subject": "zen:ticket:9007199254741997",\n "time": "2026-06-13T23:52:16.741Z",\n "type": "zen:event-type:ticket.status_changed",\n "zendesk_event_version": "2026-05-01"\n} `;
		const headers = await signedHeaders(body, {
			invocationId: 'invocation-node-17',
		});

		const response = await app.request(jsonRequest(body, headers));
		const tampered = await app.request(
			jsonRequest(body.replace('"status": "open"', '"status": "closed"'), headers),
		);

		expect(response.status).toBe(200);
		expect(tampered.status).toBe(401);
		expect(webhook).toHaveBeenCalledOnce();
		expect(webhook.mock.calls[0]?.[0]).toMatchObject({
			c: expect.any(Object),
			delivery: {
				webhookId: WEBHOOK_ID,
				invocationId: 'invocation-node-17',
				signatureTimestamp: TIMESTAMP,
			},
			payload: {
				account_id: ACCOUNT_ID,
				id: 'event-node-17',
				type: 'zen:event-type:ticket.status_changed',
				zendesk_event_version: '2026-05-01',
				subject: 'zen:ticket:9007199254741997',
				time: '2026-06-13T23:52:16.741Z',
				detail: {
					id: '9007199254741997',
					status: 'open',
					actor_id: 44881,
				},
				event: {
					current: 'open',
					previous: 'new',
					sequence: {
						id: '9007199254741999',
						position: 2,
					},
				},
			},
		});
	});

	it('preserves the open common envelope when event families are current or future', async () => {
		const webhook = vi.fn();
		const app = channelApp(
			createZendeskChannel({
				signingSecret: SIGNING_SECRET,
				webhook,
			}),
		);
		const bodies = [
			zendeskEvent({
				id: 'event-user-1',
				type: 'zen:event-type:user.created',
				subject: 'zen:user:441',
				detail: { id: 441, role: 'end-user' },
				event: { source: 'api' },
			}),
			zendeskEvent({
				id: 'event-future-1',
				type: 'zen:event-type:messaging.ai_handoff.requested',
				version: '2027-02-14',
				subject: 'zen:conversation:future-7',
				detail: { id: 'future-7', channel: 'messaging' },
				event: { reason: 'provider-added', confidence: 0.73 },
			}),
		];

		for (const [index, body] of bodies.entries()) {
			const response = await app.request(
				jsonRequest(
					body,
					await signedHeaders(body, { invocationId: `invocation-family-${index}` }),
				),
			);
			expect(response.status).toBe(200);
		}

		expect(
			webhook.mock.calls.map(([input]) => ({
				type: input.payload.type,
				version: input.payload.zendesk_event_version,
			})),
		).toEqual([
			{ type: 'zen:event-type:user.created', version: '2026-05-01' },
			{
				type: 'zen:event-type:messaging.ai_handoff.requested',
				version: '2027-02-14',
			},
		]);
	});

	it('rejects the request when signature inputs are missing, malformed, incorrect, or mismatched', async () => {
		const webhook = vi.fn();
		const app = channelApp(
			createZendeskChannel({
				signingSecret: SIGNING_SECRET,
				webhook,
			}),
		);
		const body = zendeskEvent();
		const valid = await signedHeaders(body);

		const responses = await Promise.all([
			app.request(jsonRequest(body, without(valid, 'x-zendesk-webhook-signature'))),
			app.request(
				jsonRequest(body, {
					...valid,
					'x-zendesk-webhook-signature': 'not-base64',
				}),
			),
			app.request(
				jsonRequest(
					body,
					await signedHeaders(body, {
						secret: 'different-signing-secret',
					}),
				),
			),
			app.request(
				jsonRequest(body, {
					...valid,
					'x-zendesk-webhook-signature-timestamp': '2026-06-13T23:53:17Z',
				}),
			),
		]);

		expect(responses.map((response) => response.status)).toEqual([401, 401, 401, 401]);
		expect(webhook).not.toHaveBeenCalled();
	});

	it('accepts an old timestamp when its signature is valid because Zendesk defines no freshness window', async () => {
		const webhook = vi.fn();
		const app = channelApp(
			createZendeskChannel({
				signingSecret: SIGNING_SECRET,
				webhook,
			}),
		);
		const body = zendeskEvent({ id: 'event-old-timestamp' });
		const timestamp = '2021-01-02T03:04:05Z';

		const response = await app.request(jsonRequest(body, await signedHeaders(body, { timestamp })));

		expect(response.status).toBe(200);
		expect(webhook.mock.calls[0]?.[0].delivery.signatureTimestamp).toBe(timestamp);
	});

	it('rejects the request when delivery identity headers or account binding are invalid', async () => {
		const webhook = vi.fn();
		const app = channelApp(
			createZendeskChannel({
				signingSecret: SIGNING_SECRET,
				webhook,
			}),
		);
		const body = zendeskEvent();
		const valid = await signedHeaders(body);
		const otherAccount = '9223372036854775806';

		const responses = await Promise.all([
			app.request(jsonRequest(body, without(valid, 'x-zendesk-account-id'))),
			app.request(jsonRequest(body, without(valid, 'x-zendesk-webhook-id'))),
			app.request(jsonRequest(body, without(valid, 'x-zendesk-webhook-invocation-id'))),
			app.request(jsonRequest(body, without(valid, 'x-zendesk-webhook-signature-timestamp'))),
			app.request(
				jsonRequest(body, {
					...valid,
					'x-zendesk-account-id': 'account-not-decimal',
				}),
			),
			app.request(
				jsonRequest(body, {
					...valid,
					'x-zendesk-account-id': otherAccount,
				}),
			),
		]);

		expect(responses.map((response) => response.status)).toEqual([400, 400, 400, 400, 400, 403]);
		expect(webhook).not.toHaveBeenCalled();
	});

	it('rejects the request before application code when configured identity restrictions mismatch', async () => {
		const webhook = vi.fn();
		const body = zendeskEvent();
		const matching = channelApp(
			createZendeskChannel({
				signingSecret: SIGNING_SECRET,
				accountId: ACCOUNT_ID,
				webhookId: WEBHOOK_ID,
				webhook,
			}),
		);
		const otherAccount = channelApp(
			createZendeskChannel({
				signingSecret: SIGNING_SECRET,
				accountId: '7000000000000000001',
				webhook,
			}),
		);
		const otherWebhook = channelApp(
			createZendeskChannel({
				signingSecret: SIGNING_SECRET,
				webhookId: 'different-webhook-id',
				webhook,
			}),
		);

		const responses = await Promise.all([
			matching.request(jsonRequest(body, await signedHeaders(body))),
			otherAccount.request(jsonRequest(body, await signedHeaders(body))),
			otherWebhook.request(jsonRequest(body, await signedHeaders(body))),
		]);

		expect(responses.map((response) => response.status)).toEqual([200, 403, 403]);
		expect(webhook).toHaveBeenCalledOnce();
	});

	it('rejects the request when the common envelope or account identifier is malformed', async () => {
		const webhook = vi.fn();
		const app = channelApp(
			createZendeskChannel({
				signingSecret: SIGNING_SECRET,
				webhook,
			}),
		);
		const malformedJson = '{"account_id":';
		const quotedAccount = zendeskEvent().replace(
			`"account_id":${ACCOUNT_ID}`,
			`"account_id":"${ACCOUNT_ID}"`,
		);
		const missingSubject = JSON.stringify({
			account_id: 41277,
			detail: { id: 10 },
			event: { value: 'new' },
			id: 'event-invalid-1',
			time: '2026-06-13T23:52:16.741Z',
			type: 'zen:event-type:ticket.created',
			zendesk_event_version: '2026-05-01',
		});
		const arrayDetail = zendeskEvent().replace(
			'"detail":{"id":7123498765,"status":"open"}',
			'"detail":[]',
		);

		const responses = [];
		for (const body of [malformedJson, quotedAccount, missingSubject, arrayDetail]) {
			responses.push(await app.request(jsonRequest(body, await signedHeaders(body))));
		}

		expect(responses.map((response) => response.status)).toEqual([400, 400, 400, 400]);
		expect(webhook).not.toHaveBeenCalled();
	});

	it('rejects the request when media, UTF-8, or body size is invalid', async () => {
		const webhook = vi.fn();
		const app = channelApp(
			createZendeskChannel({
				signingSecret: SIGNING_SECRET,
				bodyLimit: 256,
				webhook,
			}),
		);
		const validBody = zendeskEvent();
		const shortBody = '{}';
		const invalidBytes = new Uint8Array([0xff]);
		const largeBody = JSON.stringify({ value: 'x'.repeat(280) });

		const unsupported = await app.request(
			new Request('https://example.test/webhook', {
				method: 'POST',
				headers: { 'content-type': 'text/plain' },
				body: validBody,
			}),
		);
		const invalidUtf8 = await app.request(
			new Request('https://example.test/webhook', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					...(await signedHeaders(invalidBytes)),
				},
				body: invalidBytes,
			}),
		);
		const invalidLength = await app.request(
			new Request('https://example.test/webhook', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'content-length': '256-bytes',
					...(await signedHeaders(shortBody)),
				},
				body: shortBody,
			}),
		);
		const declared = await app.request(
			new Request('https://example.test/webhook', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'content-length': '257',
					...(await signedHeaders(shortBody)),
				},
				body: shortBody,
			}),
		);
		const streamed = await app.request(streamingRequest(largeBody, await signedHeaders(largeBody)));

		expect([
			unsupported.status,
			invalidUtf8.status,
			invalidLength.status,
			declared.status,
			streamed.status,
		]).toEqual([415, 400, 400, 413, 413]);
		expect(webhook).not.toHaveBeenCalled();
	});

	it('serializes supported results and maps a non-serializable return or a throw to retryable 409', async () => {
		// undefined -> 200, JSON -> Response.json, Response -> pass-through. A
		// non-serializable return (BigInt makes Response.json throw) and a thrown
		// handler both fall through the wrapping try/catch to a retryable 409,
		// which Zendesk retries; there is no JSON-shape validator before that.
		const outcomes: Array<undefined | object | Response | bigint | Error> = [
			undefined,
			{ received: true },
			new Response('queued', {
				status: 202,
				headers: { 'x-zendesk-result': 'custom' },
			}),
			1n,
			new Error('application handler failed'),
		];
		const responses: Response[] = [];

		for (const [index, outcome] of outcomes.entries()) {
			const app = channelApp(
				createZendeskChannel({
					signingSecret: SIGNING_SECRET,
					webhook() {
						if (outcome instanceof Error) throw outcome;
						return outcome as never;
					},
				}),
			);
			const body = zendeskEvent({ id: `event-result-${index}` });
			responses.push(
				await app.request(
					jsonRequest(
						body,
						await signedHeaders(body, {
							invocationId: `invocation-result-${index}`,
						}),
					),
				),
			);
		}

		expect(responses.map((response) => response.status)).toEqual([200, 200, 202, 409, 409]);
		await expect(responses[1]?.json()).resolves.toEqual({ received: true });
		await expect(responses[2]?.text()).resolves.toBe('queued');
		expect(responses[2]?.headers.get('x-zendesk-result')).toBe('custom');
	});

	it('round trips account-scoped ticket identity when the key is canonical', () => {
		const zendesk = createZendeskChannel({
			signingSecret: SIGNING_SECRET,
			webhook() {},
		});
		const ref = {
			accountId: ACCOUNT_ID,
			ticketId: '9007199254741997',
		};
		const key = zendesk.ticketKey(ref);

		expect(key).toBe('zendesk:v1:account:9223372036854775807:ticket:9007199254741997');
		expect(zendesk.parseTicketKey(key)).toEqual(ref);
		expect(() =>
			zendesk.ticketKey({
				accountId: '',
				ticketId: '17',
			}),
		).toThrow(InvalidZendeskInputError);
		expect(() =>
			zendesk.ticketKey({
				accountId: ACCOUNT_ID,
				ticketId: 'ticket-17',
			}),
		).toThrow(InvalidZendeskInputError);
		expect(() => zendesk.parseTicketKey('zendesk:v1:account:1:ticket:01')).toThrow(
			InvalidZendeskTicketKeyError,
		);
		expect(() => zendesk.parseTicketKey('zendesk:wrong')).toThrow(InvalidZendeskTicketKeyError);
	});

	it('validates options and publishes one fixed route when constructing the channel', () => {
		const zendesk = createZendeskChannel({
			signingSecret: SIGNING_SECRET,
			webhook() {},
		});

		expect(zendesk.routes.map(({ method, path }) => ({ method, path }))).toEqual([
			{ method: 'POST', path: '/webhook' },
		]);
		expect(() => createZendeskChannel(undefined as never)).toThrow(TypeError);
		expect(() => createZendeskChannel({ signingSecret: '', webhook() {} })).toThrow(TypeError);
		expect(() =>
			createZendeskChannel({
				signingSecret: SIGNING_SECRET,
				accountId: 'account-17',
				webhook() {},
			}),
		).toThrow(TypeError);
		expect(() =>
			createZendeskChannel({
				signingSecret: SIGNING_SECRET,
				webhookId: '',
				webhook() {},
			}),
		).toThrow(TypeError);
		expect(() =>
			createZendeskChannel({
				signingSecret: SIGNING_SECRET,
				bodyLimit: 0,
				webhook() {},
			}),
		).toThrow(TypeError);
		expect(() =>
			createZendeskChannel({
				signingSecret: SIGNING_SECRET,
				webhook: undefined as never,
			}),
		).toThrow(TypeError);

		type CustomEnv = { Bindings: { ZENDESK_AUDIT_QUEUE: string } };
		expectTypeOf<ZendeskWebhookHandlerInput<CustomEnv>['c']['env']>().toEqualTypeOf<{
			ZENDESK_AUDIT_QUEUE: string;
		}>();
		expectTypeOf(zendesk).toEqualTypeOf<ZendeskChannel>();
	});
});

function channelApp(channel: ZendeskChannel): Hono {
	const app = new Hono();
	for (const route of channel.routes) app.on(route.method, route.path, route.handler);
	return app;
}

function zendeskEvent(
	overrides: {
		accountId?: string;
		detail?: object;
		event?: object;
		id?: string;
		subject?: string;
		time?: string;
		type?: string;
		version?: string;
	} = {},
): string {
	return `{"account_id":${overrides.accountId ?? ACCOUNT_ID},"detail":${JSON.stringify(overrides.detail ?? { id: 7123498765, status: 'open' })},"event":${JSON.stringify(overrides.event ?? { current: 'open' })},"id":${JSON.stringify(overrides.id ?? 'event-default')},"subject":${JSON.stringify(overrides.subject ?? 'zen:ticket:7123498765')},"time":${JSON.stringify(overrides.time ?? '2026-06-13T23:52:16.741Z')},"type":${JSON.stringify(overrides.type ?? 'zen:event-type:ticket.created')},"zendesk_event_version":${JSON.stringify(overrides.version ?? '2026-05-01')}}`;
}

function jsonRequest(body: string, headers: Record<string, string>): Request {
	return new Request('https://example.test/webhook', {
		method: 'POST',
		headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
		body,
	});
}

function streamingRequest(body: string, headers: Record<string, string>): Request {
	const bytes = encoder.encode(body);
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(bytes.slice(0, 128));
			controller.enqueue(bytes.slice(128));
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
	body: string | Uint8Array,
	options: {
		secret?: string;
		accountId?: string;
		webhookId?: string;
		invocationId?: string;
		timestamp?: string;
	} = {},
): Promise<Record<string, string>> {
	const timestamp = options.timestamp ?? TIMESTAMP;
	return {
		'x-zendesk-account-id': options.accountId ?? ACCOUNT_ID,
		'x-zendesk-webhook-id': options.webhookId ?? WEBHOOK_ID,
		'x-zendesk-webhook-invocation-id': options.invocationId ?? 'invocation-default',
		'x-zendesk-webhook-signature-timestamp': timestamp,
		'x-zendesk-webhook-signature': await hmac(options.secret ?? SIGNING_SECRET, timestamp, body),
	};
}

async function hmac(secret: string, timestamp: string, body: string | Uint8Array): Promise<string> {
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	);
	const bodyBytes = typeof body === 'string' ? encoder.encode(body) : body;
	const signed = new Uint8Array(encoder.encode(timestamp).byteLength + bodyBytes.byteLength);
	signed.set(encoder.encode(timestamp));
	signed.set(bodyBytes, encoder.encode(timestamp).byteLength);
	const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, copyArrayBuffer(signed)));
	return base64(signature);
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

function without(headers: Record<string, string>, name: string): Record<string, string> {
	const copy = { ...headers };
	delete copy[name];
	return copy;
}
