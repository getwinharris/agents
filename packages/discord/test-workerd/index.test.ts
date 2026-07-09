import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createDiscordChannel } from '../src/index.ts';

const encoder = new TextEncoder();

describe('@bapX/discord workerd ingress', () => {
	it('verifies exact bytes and preserves provider fields when receiving an interaction', async () => {
		const { app, interactions, keyPair } = await fixture();
		const timestamp = '1717971234';
		const body = ` {\n "type":2,"id":"I1","application_id":"A1","token":"interaction-token",\n "version":1,"guild_id":"G1","channel_id":"C1","member":{"user":{"id":"U1"}},\n "data":{"id":"CMD1","type":1,"name":"ask","options":[{"value":"café"}]}\n} `;
		const signature = await sign(keyPair.privateKey, timestamp, body);
		const headers = {
			'content-type': 'application/json',
			'x-signature-ed25519': signature,
			'x-signature-timestamp': timestamp,
		};

		const response = await app.request(
			new Request('https://example.test/interactions', { method: 'POST', headers, body }),
		);
		const changed = await app.request(
			new Request('https://example.test/interactions', {
				method: 'POST',
				headers,
				body: body.replace('café', 'cafe'),
			}),
		);

		expect(response.status).toBe(200);
		expect(changed.status).toBe(401);
		expect(interactions.mock.calls[0]?.[0]?.interaction).toEqual(JSON.parse(body));
	});

	it('returns PONG without invoking application code when receiving a signed PING', async () => {
		const { app, interactions, keyPair } = await fixture();
		const request = await signedRequest(keyPair.privateKey, { type: 1 });

		const response = await app.request(request);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ type: 1 });
		expect(interactions).not.toHaveBeenCalled();
	});

	it('rejects malformed authentication and oversized streaming bodies in workerd', async () => {
		const { app, interactions } = await fixture(8);
		const malformed = new Request('https://example.test/interactions', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-signature-ed25519': 'invalid',
				'x-signature-timestamp': '1717971234',
			},
			body: '{}',
		});
		const oversized = new Request('https://example.test/interactions', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-signature-ed25519': '00'.repeat(64),
				'x-signature-timestamp': '1717971234',
			},
			body: new ReadableStream({
				start(controller) {
					controller.enqueue(encoder.encode('12345'));
					controller.enqueue(encoder.encode('6789'));
					controller.close();
				},
			}),
			duplex: 'half',
		} as RequestInit);

		expect((await app.request(malformed)).status).toBe(401);
		expect((await app.request(oversized)).status).toBe(413);
		expect(interactions).not.toHaveBeenCalled();
	});
});

async function fixture(bodyLimit?: number) {
	const keyPair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
		'sign',
		'verify',
	])) as CryptoKeyPair;
	const publicKey = toHex(new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey)));
	const interactions = vi.fn(() => ({ type: 4 as const, data: { content: 'Accepted.' } }));
	const discord = createDiscordChannel({ publicKey, bodyLimit, interactions });
	const app = new Hono();
	for (const route of discord.routes) app.on(route.method, route.path, route.handler);
	return { app, interactions, keyPair };
}

async function signedRequest(privateKey: CryptoKey, raw: unknown): Promise<Request> {
	const timestamp = '1717971234';
	const body = JSON.stringify(raw);
	const signature = await sign(privateKey, timestamp, body);
	return new Request('https://example.test/interactions', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-signature-ed25519': signature,
			'x-signature-timestamp': timestamp,
		},
		body,
	});
}

async function sign(privateKey: CryptoKey, timestamp: string, body: string): Promise<string> {
	const prefix = encoder.encode(timestamp);
	const bytes = encoder.encode(body);
	const signed = new Uint8Array(prefix.byteLength + bytes.byteLength);
	signed.set(prefix);
	signed.set(bytes, prefix.byteLength);
	return toHex(new Uint8Array(await crypto.subtle.sign('Ed25519', privateKey, signed)));
}

function toHex(bytes: Uint8Array): string {
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
