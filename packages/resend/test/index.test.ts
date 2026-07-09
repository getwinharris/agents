import { Hono } from 'hono';
import { Resend } from 'resend';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
	createResendChannel,
	type ResendChannel,
	type ResendWebhookHandlerInput,
} from '../src/index.ts';

const encoder = new TextEncoder();
const WEBHOOK_SECRET = `whsec_${base64(encoder.encode('bapX-resend-webhook-test-secret'))}`;

describe('createResendChannel()', () => {
	it('delivers a verified received-email event when exact bytes match', async () => {
		const webhook = vi.fn();
		const resend = createResendChannel({
			client: new Resend('re_node_test'),
			webhookSecret: WEBHOOK_SECRET,
			webhook,
		});
		const body = ` {\n "type":"email.received",\n "created_at":"2026-06-13T22:10:00.000Z",\n "data":${JSON.stringify(receivedEmailData())}\n} `;
		const delivery = await signedHeaders(body, { id: 'msg_exact_node' });
		const app = channelApp(resend);

		const response = await app.request(jsonRequest(body, delivery));
		const changed = await app.request(
			jsonRequest(body.replace('Support request', 'Changed request'), delivery),
		);

		expect(response.status).toBe(200);
		expect(changed.status).toBe(400);
		expect(webhook).toHaveBeenCalledOnce();
		expect(webhook.mock.calls[0]?.[0]).toMatchObject({
			c: expect.any(Object),
			delivery: {
				id: 'msg_exact_node',
				timestamp: delivery['svix-timestamp'],
			},
			event: {
				type: 'email.received',
				data: {
					email_id: 'email_inbound_1',
					message_id: '<message-1@example.test>',
					subject: 'Support request',
				},
			},
		});
	});

	it('delivers current typed email event families when their provider fields are valid', async () => {
		const webhook = vi.fn();
		const app = channelApp(
			createResendChannel({
				client: new Resend('re_email_families'),
				webhookSecret: WEBHOOK_SECRET,
				webhook,
			}),
		);
		const events = [
			emailEvent('email.delivered'),
			emailEvent('email.bounced', {
				bounce: { message: 'Mailbox unavailable', subType: 'General', type: 'Permanent' },
			}),
			emailEvent('email.clicked', {
				click: {
					ipAddress: '192.0.2.12',
					link: 'https://example.test/docs',
					timestamp: '2026-06-13T22:11:00.000Z',
					userAgent: 'Test Browser',
				},
			}),
			emailEvent('email.failed', { failed: { reason: 'Provider rejected the message' } }),
			emailEvent('email.suppressed', {
				suppressed: { message: 'Recipient is suppressed', type: 'Bounce' },
			}),
		];

		for (const [index, event] of events.entries()) {
			const body = JSON.stringify(event);
			const response = await app.request(
				jsonRequest(body, await signedHeaders(body, { id: `msg_email_${index}` })),
			);
			expect(response.status).toBe(200);
		}

		expect(webhook.mock.calls.map(([input]) => input.event.type)).toEqual([
			'email.delivered',
			'email.bounced',
			'email.clicked',
			'email.failed',
			'email.suppressed',
		]);
	});

	it('delivers current typed contact and domain event families when valid', async () => {
		const webhook = vi.fn();
		const app = channelApp(
			createResendChannel({
				client: new Resend('re_resource_families'),
				webhookSecret: WEBHOOK_SECRET,
				webhook,
			}),
		);
		const contact = {
			type: 'contact.updated',
			created_at: '2026-06-13T22:12:00.000Z',
			data: {
				id: 'contact_1',
				audience_id: 'audience_1',
				segment_ids: ['segment_1'],
				created_at: '2026-06-12T20:00:00.000Z',
				updated_at: '2026-06-13T22:12:00.000Z',
				email: 'customer@example.test',
				first_name: 'Taylor',
				unsubscribed: false,
			},
		};
		const domain = {
			type: 'domain.updated',
			created_at: '2026-06-13T22:13:00.000Z',
			data: {
				id: 'domain_1',
				name: 'mail.example.test',
				status: 'verified',
				created_at: '2026-06-10T18:00:00.000Z',
				region: 'us-east-1',
				records: [
					{
						record: 'SPF',
						name: 'send',
						type: 'TXT',
						ttl: 'Auto',
						status: 'verified',
						value: 'v=spf1 include:example.test',
					},
				],
			},
		};

		for (const [id, event] of [
			['msg_contact', contact],
			['msg_domain', domain],
		] as const) {
			const body = JSON.stringify(event);
			const response = await app.request(jsonRequest(body, await signedHeaders(body, { id })));
			expect(response.status).toBe(200);
		}

		expect(webhook.mock.calls.map(([input]) => input.event.type)).toEqual([
			'contact.updated',
			'domain.updated',
		]);
	});

	it('forwards a verified future event with its native provider payload unmodified', async () => {
		const webhook = vi.fn();
		const app = channelApp(
			createResendChannel({
				client: new Resend('re_future_event'),
				webhookSecret: WEBHOOK_SECRET,
				webhook,
			}),
		);
		const body = JSON.stringify({
			type: 'email.quarantined',
			created_at: '2026-06-13T22:14:00.000Z',
			data: { email_id: 'email_future_1', reason: 'policy' },
		});

		const response = await app.request(
			jsonRequest(body, await signedHeaders(body, { id: 'msg_future' })),
		);

		expect(response.status).toBe(200);
		expect(webhook.mock.calls[0]?.[0]).toMatchObject({
			event: {
				type: 'email.quarantined',
				created_at: '2026-06-13T22:14:00.000Z',
				data: { email_id: 'email_future_1', reason: 'policy' },
			},
			delivery: { id: 'msg_future' },
		});
		// No Bapx-owned reshape: native field names are preserved verbatim.
		const forwarded = webhook.mock.calls[0]?.[0].event as Record<string, unknown>;
		expect(forwarded).not.toHaveProperty('eventType');
		expect(forwarded).not.toHaveProperty('createdAt');
		expect(forwarded).not.toHaveProperty('raw');
	});

	it('forwards verified payloads without re-validating event-family shapes', async () => {
		const webhook = vi.fn();
		const app = channelApp(
			createResendChannel({
				client: new Resend('re_no_revalidation'),
				webhookSecret: WEBHOOK_SECRET,
				webhook,
			}),
		);
		// A body the official verifier accepts but that the previous Bapx schema
		// validators rejected. The channel must no longer drop it: shape policy
		// belongs to the application, not channel ingress.
		const received = JSON.stringify({
			type: 'email.received',
			created_at: '2026-06-13T22:15:00.000Z',
			data: { ...receivedEmailData(), attachments: [{ id: 'attachment_without_metadata' }] },
		});
		const contact = JSON.stringify({
			type: 'contact.created',
			created_at: '2026-06-13T22:15:00.000Z',
			data: { id: 'contact_without_required_fields' },
		});

		const receivedResponse = await app.request(
			jsonRequest(received, await signedHeaders(received, { id: 'msg_received_passthrough' })),
		);
		const contactResponse = await app.request(
			jsonRequest(contact, await signedHeaders(contact, { id: 'msg_contact_passthrough' })),
		);

		expect(receivedResponse.status).toBe(200);
		expect(contactResponse.status).toBe(200);
		expect(webhook.mock.calls.map(([input]) => input.event.type)).toEqual([
			'email.received',
			'contact.created',
		]);
	});

	it('rejects a verified payload that is not an object carrying a provider type', async () => {
		const webhook = vi.fn();
		const app = channelApp(
			createResendChannel({
				client: new Resend('re_floor'),
				webhookSecret: WEBHOOK_SECRET,
				webhook,
			}),
		);
		const noType = JSON.stringify({ created_at: '2026-06-13T22:16:00.000Z', data: {} });
		const notObject = JSON.stringify('just a string');

		const noTypeResponse = await app.request(
			jsonRequest(noType, await signedHeaders(noType, { id: 'msg_no_type' })),
		);
		const notObjectResponse = await app.request(
			jsonRequest(notObject, await signedHeaders(notObject, { id: 'msg_not_object' })),
		);

		expect(noTypeResponse.status).toBe(400);
		expect(notObjectResponse.status).toBe(400);
		expect(webhook).not.toHaveBeenCalled();
	});

	it('rejects missing, malformed, incorrect, stale, and future authentication', async () => {
		const webhook = vi.fn();
		const app = channelApp(
			createResendChannel({
				client: new Resend('re_auth_test'),
				webhookSecret: WEBHOOK_SECRET,
				webhook,
			}),
		);
		const body = JSON.stringify(emailEvent('email.delivered'));
		const now = Math.floor(Date.now() / 1000);
		const valid = await signedHeaders(body, { id: 'msg_auth', timestamp: now });
		const incorrect = { ...valid, 'svix-signature': 'v1,not-a-valid-signature' };
		const stale = await signedHeaders(body, { id: 'msg_stale', timestamp: now - 301 });
		const future = await signedHeaders(body, { id: 'msg_future_auth', timestamp: now + 301 });

		const responses = await Promise.all([
			app.request(jsonRequest(body)),
			app.request(
				jsonRequest(body, {
					...valid,
					'svix-timestamp': `${now}not-a-number`,
				}),
			),
			app.request(jsonRequest(body, incorrect)),
			app.request(jsonRequest(body, stale)),
			app.request(jsonRequest(body, future)),
		]);

		expect(responses.map((response) => response.status)).toEqual([400, 400, 400, 400, 400]);
		expect(webhook).not.toHaveBeenCalled();
	});

	it('rejects unsupported media, malformed JSON, invalid UTF-8, and oversized bodies', async () => {
		const webhook = vi.fn();
		const resend = createResendChannel({
			client: new Resend('re_body_test'),
			webhookSecret: WEBHOOK_SECRET,
			bodyLimit: 128,
			webhook,
		});
		const app = channelApp(resend);
		const malformedJson = '{"type":';
		const declaredHeaders = await signedHeaders('{}', { id: 'msg_declared' });

		const unsupported = await app.request(
			new Request('https://example.test/webhook', {
				method: 'POST',
				headers: { 'content-type': 'text/plain' },
				body: '{}',
			}),
		);
		const malformed = await app.request(
			jsonRequest(malformedJson, await signedHeaders(malformedJson, { id: 'msg_malformed' })),
		);
		const invalidUtf8 = await app.request(
			new Request('https://example.test/webhook', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					...(await signedHeaders('�', { id: 'msg_utf8' })),
				},
				body: new Uint8Array([0xff]),
			}),
		);
		const declared = await app.request(
			new Request('https://example.test/webhook', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'content-length': '129',
					...declaredHeaders,
				},
				body: '{}',
			}),
		);
		const streamed = await app.request(streamingRequest('x'.repeat(129), declaredHeaders));

		expect([
			unsupported.status,
			malformed.status,
			invalidUtf8.status,
			declared.status,
			streamed.status,
		]).toEqual([415, 400, 400, 413, 413]);
		expect(webhook).not.toHaveBeenCalled();
	});

	it('serializes JSON returns, passes Response through, and acknowledges no value with 200', async () => {
		const body = JSON.stringify(emailEvent('email.delivered'));
		const outcomes: Array<undefined | object | Response> = [
			undefined,
			{ accepted: true },
			new Response('queued', { status: 202, headers: { 'x-result': 'response' } }),
		];
		const responses: Response[] = [];

		for (const [index, outcome] of outcomes.entries()) {
			const app = channelApp(
				createResendChannel({
					client: new Resend(`re_handler_${index}`),
					webhookSecret: WEBHOOK_SECRET,
					webhook() {
						return outcome as never;
					},
				}),
			);
			responses.push(
				await app.request(
					jsonRequest(body, await signedHeaders(body, { id: `msg_handler_${index}` })),
				),
			);
		}

		expect(responses.map((response) => response.status)).toEqual([200, 200, 202]);
		await expect(responses[1]?.json()).resolves.toEqual({ accepted: true });
		await expect(responses[2]?.text()).resolves.toBe('queued');
		expect(responses[2]?.headers.get('x-result')).toBe('response');
	});

	it('lets the Hono error handler handle thrown and non-serializable returns', async () => {
		const body = JSON.stringify(emailEvent('email.delivered'));
		// A thrown handler and a return that `Response.json` cannot serialize (a
		// BigInt throws) both now propagate to the framework error handler rather
		// than producing a channel-owned clean 500.
		const failures: Array<{ id: string; outcome: 'throw' | 'bigint' }> = [
			{ id: 'msg_handler_throw', outcome: 'throw' },
			{ id: 'msg_handler_bigint', outcome: 'bigint' },
		];

		for (const { id, outcome } of failures) {
			const failure = new Error('handler failure');
			const app = channelApp(
				createResendChannel({
					client: new Resend(`re_${id}`),
					webhookSecret: WEBHOOK_SECRET,
					webhook() {
						if (outcome === 'throw') throw failure;
						return 1n as never;
					},
				}),
			);
			let received: unknown;
			app.onError((error, c) => {
				received = error;
				return c.text('handled', 503);
			});

			const response = await app.request(jsonRequest(body, await signedHeaders(body, { id })));

			expect(response.status).toBe(503);
			expect(await response.text()).toBe('handled');
			if (outcome === 'throw') expect(received).toBe(failure);
			else expect(received).toBeInstanceOf(TypeError);
		}
	});

	it('validates constructor options and publishes only the fixed webhook route', () => {
		const client = new Resend('re_constructor_test');
		const resend = createResendChannel({
			client,
			webhookSecret: WEBHOOK_SECRET,
			webhook() {},
		});

		expect(resend.routes.map(({ method, path }) => ({ method, path }))).toEqual([
			{ method: 'POST', path: '/webhook' },
		]);
		expect(() => createResendChannel(undefined as never)).toThrow(TypeError);
		expect(() =>
			createResendChannel({
				client: {} as Resend,
				webhookSecret: WEBHOOK_SECRET,
				webhook() {},
			}),
		).toThrow(TypeError);
		expect(() => createResendChannel({ client, webhookSecret: '', webhook() {} })).toThrow(
			TypeError,
		);
		expect(() =>
			createResendChannel({
				client,
				webhookSecret: WEBHOOK_SECRET,
				webhook: undefined as never,
			}),
		).toThrow(TypeError);
		expect(() =>
			createResendChannel({
				client,
				webhookSecret: WEBHOOK_SECRET,
				bodyLimit: 0,
				webhook() {},
			}),
		).toThrow(TypeError);

		type CustomEnv = { Bindings: { AUDIT_BUCKET: string } };
		expectTypeOf<ResendWebhookHandlerInput<CustomEnv>['c']['env']>().toEqualTypeOf<{
			AUDIT_BUCKET: string;
		}>();
		expectTypeOf(resend).toEqualTypeOf<ResendChannel>();
	});
});

function channelApp(channel: ResendChannel): Hono {
	const app = new Hono();
	for (const route of channel.routes) app.on(route.method, route.path, route.handler);
	return app;
}

function jsonRequest(body: string, headers: Record<string, string> = {}): Request {
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
	body: string,
	options: { id: string; timestamp?: number },
): Promise<Record<string, string>> {
	const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
	const secret = encoder.encode('bapX-resend-webhook-test-secret');
	const key = await crypto.subtle.importKey(
		'raw',
		secret,
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	);
	const signature = new Uint8Array(
		await crypto.subtle.sign('HMAC', key, encoder.encode(`${options.id}.${timestamp}.${body}`)),
	);
	return {
		'svix-id': options.id,
		'svix-timestamp': String(timestamp),
		'svix-signature': `v1,${base64(signature)}`,
	};
}

function receivedEmailData(): Record<string, unknown> {
	return {
		email_id: 'email_inbound_1',
		created_at: '2026-06-13T22:09:59.000Z',
		from: 'customer@example.test',
		to: ['support@inbound.example.test'],
		bcc: [],
		cc: ['manager@example.test'],
		message_id: '<message-1@example.test>',
		subject: 'Support request',
		attachments: [
			{
				id: 'attachment_1',
				filename: 'details.txt',
				content_type: 'text/plain',
				content_disposition: 'attachment',
				content_id: null,
			},
		],
	};
}

function emailEvent(type: string, fields: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		type,
		created_at: '2026-06-13T22:10:00.000Z',
		data: {
			email_id: 'email_outbound_1',
			created_at: '2026-06-13T22:09:58.000Z',
			from: 'support@example.test',
			to: ['customer@example.test'],
			subject: 'Account update',
			tags: { category: 'support' },
			...fields,
		},
	};
}

function base64(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}
