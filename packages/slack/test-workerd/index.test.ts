import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createSlackChannel } from '../src/index.ts';

const encoder = new TextEncoder();

describe('@bapX/slack workerd ingress', () => {
	it('verifies exact Events API bytes when a provider-native event is received', async () => {
		const events = vi.fn();
		const slack = createSlackChannel({
			signingSecret: 'secret',
			events,
		});
		const app = channelApp(slack);
		const body = ` {"token":"verification-token","type":"event_callback","api_app_id":"A123","team_id":"T123","event_id":"Ev1","event_time":1717971234,"event":{"type":"app_mention","channel":"C1","ts":"1.1","event_ts":"1.1","text":"café","user":"U1"}} `;
		const timestamp = Math.floor(Date.now() / 1000);
		const signature = await hmac(`v0:${timestamp}:${body}`);
		const headers = {
			'content-type': 'application/json',
			'x-slack-request-timestamp': String(timestamp),
			'x-slack-signature': `v0=${signature}`,
		};

		const response = await app.request(
			new Request('https://example.test/events', { method: 'POST', headers, body }),
		);
		const changed = await app.request(
			new Request('https://example.test/events', {
				method: 'POST',
				headers,
				body: body.replace('café', 'cafe'),
			}),
		);

		expect(response.status).toBe(200);
		expect(changed.status).toBe(401);
		expect(events).toHaveBeenCalledOnce();
		expect(events.mock.calls[0]?.[0].payload.event).toMatchObject({
			type: 'app_mention',
			text: 'café',
		});
	});

	it('passes provider-native slash commands and shortcuts when running in workerd', async () => {
		const commands = vi.fn();
		const interactions = vi.fn();
		const slack = createSlackChannel({
			signingSecret: 'secret',
			commands,
			interactions,
		});
		const app = channelApp(slack);

		const commandResponse = await app.request(
			await signedFormRequest(
				'/commands',
				new URLSearchParams({
					api_app_id: 'A123',
					team_id: 'T123',
					channel_id: 'C123',
					user_id: 'U123',
					command: '/triage',
					text: 'incident 42',
					trigger_id: 'command-trigger',
					response_url: 'https://hooks.slack.test/commands/response',
				}).toString(),
			),
		);
		const shortcut = {
			type: 'shortcut',
			team: { id: 'T123' },
			user: { id: 'U123' },
			callback_id: 'open_triage',
			trigger_id: 'shortcut-trigger',
		};
		const shortcutResponse = await app.request(
			await signedFormRequest(
				'/interactions',
				new URLSearchParams({ payload: JSON.stringify(shortcut) }).toString(),
			),
		);

		expect(commandResponse.status).toBe(200);
		expect(shortcutResponse.status).toBe(200);
		expect(commands.mock.calls[0]?.[0].payload).toMatchObject({
			command: '/triage',
			text: 'incident 42',
			trigger_id: 'command-trigger',
		});
		expect(interactions.mock.calls[0]?.[0].payload).toEqual(shortcut);
	});
});

function channelApp(channel: ReturnType<typeof createSlackChannel>): Hono {
	const app = new Hono();
	for (const route of channel.routes) app.on(route.method, route.path, route.handler);
	return app;
}

async function hmac(value: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode('secret'),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	);
	const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
	return Array.from(signature, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function signedFormRequest(path: string, body: string): Promise<Request> {
	const timestamp = Math.floor(Date.now() / 1000);
	const signature = await hmac(`v0:${timestamp}:${body}`);
	return new Request(`https://example.test${path}`, {
		method: 'POST',
		headers: {
			'content-type': 'application/x-www-form-urlencoded',
			'x-slack-request-timestamp': String(timestamp),
			'x-slack-signature': `v0=${signature}`,
		},
		body,
	});
}
