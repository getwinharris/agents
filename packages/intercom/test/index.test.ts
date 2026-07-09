import { Hono } from 'hono';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
	createIntercomChannel,
	type IntercomChannel,
	type IntercomWebhookHandlerInput,
	InvalidIntercomConversationKeyError,
	InvalidIntercomInputError,
} from '../src/index.ts';

const encoder = new TextEncoder();
const CLIENT_SECRET = 'bapX-intercom-client-secret';

describe('createIntercomChannel()', () => {
	it('delivers the typed event when exact signed bytes match', async () => {
		const webhook = vi.fn();
		const app = channelApp(
			createIntercomChannel({
				clientSecret: CLIENT_SECRET,
				webhook,
			}),
		);
		const body = ` {\n  "type":"notification_event",\n  "topic":"conversation.user.replied",\n  "id":"notif-node-17",\n  "app_id":"workspace-node",\n  "created_at":1781393001,\n  "delivery_attempts":2,\n  "first_sent_at":1781392990,\n  "self":"https://api.intercom.io/notifications/notif-node-17",\n  "data":{"type":"notification_event_data","item":{"type":"conversation","id":"conversation-17","source":{"body":"Need help"}}}\n} `;
		const headers = await signedHeaders(body);

		const response = await app.request(jsonRequest(body, headers));
		const tampered = await app.request(
			jsonRequest(body.replace('Need help', 'Changed body'), headers),
		);

		expect(response.status).toBe(200);
		expect(tampered.status).toBe(401);
		expect(webhook).toHaveBeenCalledOnce();
		expect(webhook.mock.calls[0]?.[0]).toMatchObject({
			c: expect.any(Object),
			notification: {
				type: 'notification_event',
				topic: 'conversation.user.replied',
				app_id: 'workspace-node',
				id: 'notif-node-17',
				created_at: 1781393001,
				delivery_attempts: 2,
				first_sent_at: 1781392990,
				self: 'https://api.intercom.io/notifications/notif-node-17',
				data: {
					type: 'notification_event_data',
					item: {
						type: 'conversation',
						id: 'conversation-17',
						source: { body: 'Need help' },
					},
				},
			},
		});
	});

	it('acknowledges endpoint validation when Intercom sends HEAD', async () => {
		const webhook = vi.fn();
		const app = channelApp(
			createIntercomChannel({
				clientSecret: CLIENT_SECRET,
				webhook,
			}),
		);

		const response = await app.request(
			new Request('https://example.test/webhook', { method: 'HEAD' }),
		);

		expect(response.status).toBe(200);
		expect(await response.text()).toBe('');
		expect(webhook).not.toHaveBeenCalled();
	});

	it('preserves ping and future topics when their envelopes are valid', async () => {
		const webhook = vi.fn();
		const app = channelApp(
			createIntercomChannel({
				clientSecret: CLIENT_SECRET,
				webhook,
			}),
		);
		const deliveries = [
			notification({
				topic: 'ping',
				id: null,
				item: { type: 'ping', message: 'periodic check' },
			}),
			notification({
				topic: 'conversation.ai_agent.reviewed',
				id: 'notif-future-1',
				item: { type: 'conversation', id: 'conversation-future' },
			}),
		];

		for (const body of deliveries) {
			const response = await app.request(jsonRequest(body, await signedHeaders(body)));
			expect(response.status).toBe(200);
		}

		expect(
			webhook.mock.calls.map(([input]) => ({
				topic: input.notification.topic,
				id: input.notification.id,
			})),
		).toEqual([
			{ topic: 'ping', id: null },
			{
				topic: 'conversation.ai_agent.reviewed',
				id: 'notif-future-1',
			},
		]);
	});

	it('rejects the request when authentication or envelope input is invalid', async () => {
		const webhook = vi.fn();
		const app = channelApp(
			createIntercomChannel({
				clientSecret: CLIENT_SECRET,
				webhook,
			}),
		);
		const validBody = notification({
			item: { type: 'contact', id: 'contact-2' },
		});
		const malformedBody = '{"type":"notification_event"';
		const invalidEnvelope = JSON.stringify({
			type: 'notification_event',
			topic: 'contact.user.created',
			app_id: 'workspace-node',
			data: { item: {} },
		});

		const responses = await Promise.all([
			app.request(jsonRequest(validBody, {})),
			app.request(jsonRequest(validBody, { 'x-hub-signature': 'sha1=not-hex' })),
			app.request(jsonRequest(validBody, await signedHeaders(validBody, 'other-secret'))),
			app.request(jsonRequest(malformedBody, await signedHeaders(malformedBody))),
			app.request(jsonRequest(invalidEnvelope, await signedHeaders(invalidEnvelope))),
		]);

		expect(responses.map((response) => response.status)).toEqual([401, 401, 401, 400, 400]);
		expect(webhook).not.toHaveBeenCalled();
	});

	it('rejects the request when media type or body size is invalid', async () => {
		const webhook = vi.fn();
		const app = channelApp(
			createIntercomChannel({
				clientSecret: CLIENT_SECRET,
				bodyLimit: 128,
				webhook,
			}),
		);
		const body = notification({
			item: { type: 'contact', id: 'contact-size' },
		});
		const shortBody = '{}';
		const largeBody = JSON.stringify({ value: 'x'.repeat(180) });
		const invalidUtf8 = new Uint8Array([0xff]);

		const unsupported = await app.request(
			new Request('https://example.test/webhook', {
				method: 'POST',
				headers: { 'content-type': 'text/plain' },
				body,
			}),
		);
		const invalidEncoding = await app.request(
			new Request('https://example.test/webhook', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					...(await signedHeaders(invalidUtf8)),
				},
				body: invalidUtf8,
			}),
		);
		const malformedLength = await app.request(
			new Request('https://example.test/webhook', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'content-length': 'large',
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
					'content-length': '129',
					...(await signedHeaders(shortBody)),
				},
				body: shortBody,
			}),
		);
		const streamed = await app.request(streamingRequest(largeBody, await signedHeaders(largeBody)));

		expect([
			unsupported.status,
			invalidEncoding.status,
			malformedLength.status,
			declared.status,
			streamed.status,
		]).toEqual([415, 400, 400, 413, 413]);
		expect(webhook).not.toHaveBeenCalled();
	});

	it('serializes supported results when the handler completes', async () => {
		const outcomes: Array<undefined | { received: boolean } | Response> = [
			undefined,
			{ received: true },
			new Response('queued', {
				status: 202,
				headers: { 'x-intercom-result': 'custom' },
			}),
		];
		const responses: Response[] = [];

		for (const [index, outcome] of outcomes.entries()) {
			const app = channelApp(
				createIntercomChannel({
					clientSecret: CLIENT_SECRET,
					webhook: () => outcome,
				}),
			);
			const body = notification({
				id: `notif-result-${index}`,
				item: { type: 'contact', id: `contact-${index}` },
			});
			responses.push(await app.request(jsonRequest(body, await signedHeaders(body))));
		}

		expect(responses.map((response) => response.status)).toEqual([200, 200, 202]);
		await expect(responses[1]?.json()).resolves.toEqual({ received: true });
		await expect(responses[2]?.text()).resolves.toBe('queued');
		expect(responses[2]?.headers.get('x-intercom-result')).toBe('custom');
	});

	it('serializes non-JSON numbers to null and surfaces thrown callbacks to the framework', async () => {
		// A finite-coercion edge like NaN now serializes (to null) and returns 200
		// instead of producing a clean 500; only a thrown callback fails closed.
		const naN = channelApp(
			createIntercomChannel({
				clientSecret: CLIENT_SECRET,
				webhook: () => Number.NaN as never,
			}),
		);
		const naNBody = notification({
			id: 'notif-nan',
			item: { type: 'contact', id: 'contact-nan' },
		});
		const naNResponse = await naN.request(jsonRequest(naNBody, await signedHeaders(naNBody)));

		const thrown = channelApp(
			createIntercomChannel({
				clientSecret: CLIENT_SECRET,
				webhook() {
					throw new Error('application handler failed');
				},
			}),
		);
		const thrownBody = notification({
			id: 'notif-thrown',
			item: { type: 'contact', id: 'contact-thrown' },
		});
		const thrownResponse = await thrown.request(
			jsonRequest(thrownBody, await signedHeaders(thrownBody)),
		);

		expect(naNResponse.status).toBe(200);
		await expect(naNResponse.json()).resolves.toBeNull();
		expect(thrownResponse.status).toBe(500);
	});

	it('round trips canonical conversation identity when values contain delimiters', () => {
		const intercom = createIntercomChannel({
			clientSecret: CLIENT_SECRET,
			webhook() {},
		});
		const ref = {
			workspaceId: 'workspace:us/east',
			conversationId: 'conversation:42/part',
		};
		const key = intercom.conversationKey(ref);

		expect(intercom.parseConversationKey(key)).toEqual(ref);
		expect(() =>
			intercom.conversationKey({
				workspaceId: '',
				conversationId: 'conversation-1',
			}),
		).toThrow(InvalidIntercomInputError);
		expect(() => intercom.parseConversationKey('intercom:wrong')).toThrow(
			InvalidIntercomConversationKeyError,
		);
	});

	it('publishes fixed routes when constructor options are valid', () => {
		const intercom = createIntercomChannel({
			clientSecret: CLIENT_SECRET,
			webhook() {},
		});

		expect(intercom.routes.map(({ method, path }) => ({ method, path }))).toEqual([
			{ method: 'HEAD', path: '/webhook' },
			{ method: 'POST', path: '/webhook' },
		]);
		expect(() => createIntercomChannel(undefined as never)).toThrow(TypeError);
		expect(() => createIntercomChannel({ clientSecret: '', webhook() {} })).toThrow(TypeError);
		expect(() =>
			createIntercomChannel({
				clientSecret: CLIENT_SECRET,
				bodyLimit: 0,
				webhook() {},
			}),
		).toThrow(TypeError);

		type CustomEnv = { Bindings: { INTERCOM_AUDIT_QUEUE: string } };
		expectTypeOf<IntercomWebhookHandlerInput<CustomEnv>['c']['env']>().toEqualTypeOf<{
			INTERCOM_AUDIT_QUEUE: string;
		}>();
		expectTypeOf(intercom).toEqualTypeOf<IntercomChannel>();
	});
});

function channelApp(channel: IntercomChannel): Hono {
	const app = new Hono();
	app.all('/webhook', (c) => {
		const route = channel.routes.find(
			(candidate) => candidate.method === c.req.method && candidate.path === '/webhook',
		);
		return route ? route.handler(c, async () => {}) : new Response(null, { status: 405 });
	});
	return app;
}

function notification(
	overrides: {
		topic?: string;
		id?: string | null;
		workspaceId?: string;
		item: object;
	} = { item: {} },
): string {
	return JSON.stringify({
		type: 'notification_event',
		topic: overrides.topic ?? 'contact.user.created',
		id: overrides.id === undefined ? 'notif-default' : overrides.id,
		app_id: overrides.workspaceId ?? 'workspace-node',
		created_at: 1781393001,
		delivery_attempts: 1,
		first_sent_at: 1781393002,
		data: {
			type: 'notification_event_data',
			item: overrides.item,
		},
	});
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
			controller.enqueue(bytes.slice(0, 64));
			controller.enqueue(bytes.slice(64));
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
	secret = CLIENT_SECRET,
): Promise<Record<string, string>> {
	return { 'x-hub-signature': `sha1=${await hmac(secret, body)}` };
}

async function hmac(secret: string, body: string | Uint8Array): Promise<string> {
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-1' },
		false,
		['sign'],
	);
	const signature = new Uint8Array(
		await crypto.subtle.sign(
			'HMAC',
			key,
			typeof body === 'string' ? encoder.encode(body) : copyArrayBuffer(body),
		),
	);
	return Array.from(signature, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function copyArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	const copy = new Uint8Array(bytes.byteLength);
	copy.set(bytes);
	return copy.buffer;
}
