import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import {
	createGitHubChannel,
	type GitHubChannel,
	InvalidGitHubConversationKeyError,
} from '../src/index.ts';

const encoder = new TextEncoder();

describe('createGitHubChannel()', () => {
	it('invokes one constructor handler with the native signed payload', async () => {
		const webhook = vi.fn();
		const github = createGitHubChannel({
			webhookSecret: 'secret',
			webhook,
		});
		const raw = {
			action: 'opened',
			installation: { id: 90 },
			repository: { id: 12, name: 'widgets', owner: { login: 'acme' } },
			sender: { id: 77, login: 'octo-reviewer', type: 'User' },
			issue: { number: 42, title: 'Unicode café', body: null },
		};
		const body = ` {\n  "action": "opened",\n  "installation": { "id": 90 },\n  "repository": { "id": 12, "name": "widgets", "owner": { "login": "acme" } },\n  "sender": { "id": 77, "login": "octo-reviewer", "type": "User" },\n  "issue": { "number": 42, "title": "Unicode café", "body": null }\n} `;

		const response = await channelApp(github).request(
			await signedRequest({
				secret: 'secret',
				body,
				event: 'issues',
				headers: {
					'x-github-hook-id': '1234',
					'x-github-hook-installation-target-id': '5678',
					'x-github-hook-installation-target-type': 'repository',
				},
			}),
		);

		expect(response.status).toBe(200);
		expect(webhook).toHaveBeenCalledOnce();
		expect(webhook.mock.calls[0]?.[0]).toMatchObject({
			c: expect.any(Object),
			delivery: {
				name: 'issues',
				deliveryId: 'delivery-1',
				hookId: '1234',
				installationTarget: { id: '5678', type: 'repository' },
				payload: raw,
			},
		});
	});

	it('discriminates the native payload by the X-GitHub-Event name', async () => {
		const seen: string[] = [];
		const github = createGitHubChannel({
			webhookSecret: 'secret',
			webhook({ delivery }) {
				switch (delivery.name) {
					case 'issues':
						seen.push(`issues:${delivery.payload.action}`);
						return;
					case 'pull_request':
						seen.push(`pull_request:${delivery.payload.action}`);
						return;
					default:
						return;
				}
			},
		});
		const app = channelApp(github);

		const issueResponse = await app.request(
			await signedRequest({
				secret: 'secret',
				event: 'issues',
				body: JSON.stringify({
					action: 'opened',
					repository: { id: 12, name: 'widgets', owner: { login: 'acme' } },
					sender: { id: 77, login: 'octo-reviewer', type: 'User' },
					issue: { number: 42, title: 'Bug', body: null },
				}),
			}),
		);
		const pullResponse = await app.request(
			await signedRequest({
				secret: 'secret',
				event: 'pull_request',
				body: JSON.stringify({
					action: 'opened',
					repository: { id: 12, name: 'widgets', owner: { login: 'acme' } },
					sender: { id: 77, login: 'octo-reviewer', type: 'User' },
					pull_request: { number: 7, title: 'Feature', body: 'Details' },
				}),
			}),
		);

		expect(issueResponse.status).toBe(200);
		expect(pullResponse.status).toBe(200);
		expect(seen).toEqual(['issues:opened', 'pull_request:opened']);
	});

	it('forwards the full native pull-request review comment payload unchanged', async () => {
		const webhook = vi.fn();
		const github = createGitHubChannel({ webhookSecret: 'secret', webhook });
		const raw = {
			action: 'created',
			repository: { id: 12, name: 'widgets', owner: { login: 'acme' } },
			sender: { id: 77, login: 'octo-reviewer', type: 'User' },
			pull_request: { number: 7, title: 'Keep edge auth portable' },
			comment: {
				id: 6002,
				in_reply_to_id: 6001,
				pull_request_review_id: 7001,
				body: '@bapX-bot can you check this branch?',
				path: 'src/auth.ts',
				line: 42,
			},
		};

		const response = await channelApp(github).request(
			await signedRequest({
				secret: 'secret',
				event: 'pull_request_review_comment',
				body: JSON.stringify(raw),
			}),
		);

		expect(response.status).toBe(200);
		expect(webhook.mock.calls[0]?.[0].delivery).toEqual({
			name: 'pull_request_review_comment',
			deliveryId: 'delivery-1',
			hookId: undefined,
			installationTarget: undefined,
			payload: raw,
		});
	});

	it('forwards every verified delivery, including events without an action', async () => {
		const webhook = vi.fn();
		const github = createGitHubChannel({ webhookSecret: 'secret', webhook });

		const archived = await channelApp(github).request(
			await signedRequest({
				secret: 'secret',
				event: 'repository',
				body: JSON.stringify({ action: 'archived', repository: { id: 12 } }),
			}),
		);
		const pushed = await channelApp(github).request(
			await signedRequest({
				secret: 'secret',
				event: 'push',
				body: JSON.stringify({ ref: 'refs/heads/main', after: 'abc123' }),
			}),
		);

		expect(archived.status).toBe(200);
		expect(pushed.status).toBe(200);
		expect(webhook.mock.calls[0]?.[0].delivery).toMatchObject({
			name: 'repository',
			payload: { action: 'archived' },
		});
		expect(webhook.mock.calls[1]?.[0].delivery).toMatchObject({
			name: 'push',
			payload: { ref: 'refs/heads/main' },
		});
	});

	it('handles a signed ping internally without invoking the callback', async () => {
		const webhook = vi.fn();
		const github = createGitHubChannel({ webhookSecret: 'secret', webhook });

		const response = await channelApp(github).request(
			await signedRequest({
				secret: 'secret',
				event: 'ping',
				body: JSON.stringify({ zen: 'Keep it logically awesome.' }),
			}),
		);

		expect(response.status).toBe(200);
		expect(webhook).not.toHaveBeenCalled();
	});

	it('uses JSON returns as the response body and passes Hono responses through', async () => {
		const shared = { accepted: true };
		const jsonChannel = createGitHubChannel({
			webhookSecret: 'secret',
			webhook: () => ({ first: shared, second: shared }),
		});
		const honoChannel = createGitHubChannel({
			webhookSecret: 'secret',
			webhook: ({ c }) => c.json({ accepted: true }, 202),
		});
		const request = () =>
			signedRequest({
				secret: 'secret',
				event: 'repository',
				body: JSON.stringify({ action: 'archived' }),
			});

		const jsonResponse = await channelApp(jsonChannel).request(await request());
		const honoResponse = await channelApp(honoChannel).request(await request());

		expect(jsonResponse.status).toBe(200);
		expect(await jsonResponse.json()).toEqual({
			first: { accepted: true },
			second: { accepted: true },
		});
		expect(honoResponse.status).toBe(202);
		expect(await honoResponse.json()).toEqual({ accepted: true });
	});

	it('lets the Hono error handler handle thrown handlers and non-serializable returns', async () => {
		const failure = new Error('dispatch failed');
		const throwing = createGitHubChannel({
			webhookSecret: 'secret',
			webhook() {
				throw failure;
			},
		});
		// A BigInt return is not JSON-serializable; `Response.json` throws and the
		// failure falls through to Hono's framework error handler.
		const invalid = createGitHubChannel({
			webhookSecret: 'secret',
			webhook: () => 1n as never,
		});
		const request = () =>
			signedRequest({
				secret: 'secret',
				event: 'repository',
				body: JSON.stringify({ action: 'archived' }),
			});

		let received: unknown;
		const throwingApp = channelApp(throwing);
		throwingApp.onError((error, c) => {
			received = error;
			return c.text('handled', 503);
		});
		const throwingResponse = await throwingApp.request(await request());
		expect(throwingResponse.status).toBe(503);
		expect(await throwingResponse.text()).toBe('handled');
		expect(received).toBe(failure);

		const invalidApp = channelApp(invalid);
		invalidApp.onError((_error, c) => c.text('handled', 503));
		expect((await invalidApp.request(await request())).status).toBe(503);
	});

	it('serializes a non-finite number return as JSON null with a 200', async () => {
		const channel = createGitHubChannel({
			webhookSecret: 'secret',
			webhook: () => Number.NaN as never,
		});
		const response = await channelApp(channel).request(
			await signedRequest({
				secret: 'secret',
				event: 'repository',
				body: JSON.stringify({ action: 'archived' }),
			}),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toBe(null);
	});

	it('rejects missing invalid and changed signatures before invoking the callback', async () => {
		const webhook = vi.fn();
		const github = createGitHubChannel({ webhookSecret: 'secret', webhook });
		const app = channelApp(github);
		const headers = {
			'content-type': 'application/json',
			'x-github-delivery': 'delivery-1',
			'x-github-event': 'ping',
		};

		const missing = await app.request(
			new Request('https://example.test/webhook', {
				method: 'POST',
				headers,
				body: '{}',
			}),
		);
		const signed = await signedRequest({
			secret: 'secret',
			event: 'ping',
			body: '{"zen":"ok"}',
		});
		const changed = await app.request(
			new Request(signed.url, {
				method: 'POST',
				headers: signed.headers,
				body: '{"zen":"changed"}',
			}),
		);

		expect(missing.status).toBe(401);
		expect(changed.status).toBe(401);
		expect(webhook).not.toHaveBeenCalled();
	});

	it('rejects form-encoded ingress and oversized bodies', async () => {
		const webhook = vi.fn();
		const github = createGitHubChannel({
			webhookSecret: 'secret',
			bodyLimit: 512,
			webhook,
		});
		const raw = {
			action: 'created',
			repository: { id: 12, name: 'widgets', owner: { login: 'acme' } },
			sender: { id: 77, login: 'octo-reviewer', type: 'User' },
			issue: { number: 42, title: 'Review edge support', pull_request: { url: 'unused' } },
			comment: { id: 99, body: 'Looks good +1' },
		};
		const body = new URLSearchParams({ payload: JSON.stringify(raw) }).toString();

		// Ingress is JSON-only; a form-encoded delivery is rejected on content type
		// before signature verification runs.
		const formResponse = await channelApp(github).request(
			await signedRequest({
				secret: 'secret',
				body,
				event: 'issue_comment',
				contentType: 'application/x-www-form-urlencoded',
			}),
		);
		const oversized = await channelApp(github).request(
			new Request('https://example.test/webhook', {
				method: 'POST',
				headers: {
					'content-length': '513',
					'content-type': 'application/json',
				},
				body: '{}',
			}),
		);

		expect(formResponse.status).toBe(415);
		expect(webhook).not.toHaveBeenCalled();
		expect(oversized.status).toBe(413);
	});

	it('declares one fixed webhook route and does not invoke the callback eagerly', () => {
		const webhook = vi.fn();
		const github = createGitHubChannel({ webhookSecret: 'secret', webhook });

		expect(github.routes).toEqual([
			{
				method: 'POST',
				path: '/webhook',
				handler: expect.any(Function),
			},
		]);
		expect(webhook).not.toHaveBeenCalled();
	});

	it('round-trips canonical issue references and rejects foreign keys', () => {
		const github = createGitHubChannel({
			webhookSecret: 'secret',
			webhook() {},
		});
		const ref = { owner: 'with:astro', repo: 'bapX/next?#', issueNumber: 42 };
		const key = github.conversationKey(ref);

		expect(key).toBe('github:v1:owner:with%3Aastro:repo:bapX%2Fnext%3F%23:issue:42');
		expect(github.parseConversationKey(key)).toEqual(ref);
		expect(() => github.parseConversationKey('slack:v1:owner:acme:repo:widgets:issue:42')).toThrow(
			InvalidGitHubConversationKeyError,
		);
	});
});

function channelApp(channel: GitHubChannel): Hono {
	const app = new Hono();
	for (const route of channel.routes) app.on(route.method, route.path, route.handler);
	return app;
}

interface SignedRequestOptions {
	secret: string;
	body: string;
	event: string;
	contentType?: string;
	headers?: Record<string, string>;
}

async function signedRequest(options: SignedRequestOptions): Promise<Request> {
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(options.secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	);
	const signature = new Uint8Array(
		await crypto.subtle.sign('HMAC', key, encoder.encode(options.body)),
	);
	const signatureHex = Array.from(signature, (byte) => byte.toString(16).padStart(2, '0')).join('');
	return new Request('https://example.test/webhook', {
		method: 'POST',
		headers: {
			'content-type': options.contentType ?? 'application/json; charset=utf-8',
			'x-github-delivery': 'delivery-1',
			'x-github-event': options.event,
			'x-hub-signature-256': `sha256=${signatureHex}`,
			...options.headers,
		},
		body: options.body,
	});
}
