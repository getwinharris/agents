import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createTelegramChannel } from '../src/index.ts';

describe('@bapX/telegram workerd ingress', () => {
	it('verifies the secret header and forwards a native Update in workerd', async () => {
		const webhook = vi.fn();
		const telegram = createTelegramChannel({
			secretToken: 'worker_secret-7',
			webhook,
		});
		const app = new Hono();
		for (const route of telegram.routes) {
			app.on(route.method, route.path, route.handler);
		}
		const update = {
			update_id: 880_440,
			message: {
				message_id: 44,
				date: 1_781_101_000,
				chat: {
					id: -1_003_040_506,
					type: 'channel',
					title: 'Inbox',
				},
				direct_messages_topic: { topic_id: 64, user: { id: 1 } },
				text: 'Worker delivery',
			},
		};
		const body = JSON.stringify(update);

		const accepted = await app.request(
			new Request('https://example.test/webhook', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'x-telegram-bot-api-secret-token': 'worker_secret-7',
				},
				body,
			}),
		);
		const rejected = await app.request(
			new Request('https://example.test/webhook', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'x-telegram-bot-api-secret-token': 'worker_secret-8',
				},
				body,
			}),
		);

		expect(accepted.status).toBe(200);
		expect(rejected.status).toBe(401);
		expect(webhook).toHaveBeenCalledOnce();
		expect(webhook.mock.calls[0]?.[0].update).toEqual(update);
	});
});
