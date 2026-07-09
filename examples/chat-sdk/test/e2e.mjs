import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

const baseUrl = process.env.FLUE_CHAT_BASE_URL ?? 'http://localhost:3585';
const payload = {
	action: 'created',
	comment: {
		id: 99,
		body: '@bapX-bot please reply',
		created_at: '2026-05-25T00:00:00.000Z',
		updated_at: '2026-05-25T00:00:00.000Z',
		user: { id: 2, login: 'octocat', type: 'User' },
	},
	issue: { number: 42 },
	repository: { name: 'widgets', owner: { id: 3, login: 'acme', type: 'Organization' } },
	sender: { id: 2, login: 'octocat', type: 'User' },
};
const body = JSON.stringify(payload);
const signature = `sha256=${createHmac('sha256', 'chat-sdk-example-secret').update(body).digest('hex')}`;

const response = await sendWebhookWhenReady();
assert.equal(response.status, 200);
assert.equal(await response.text(), 'ok');

const comments = await waitForOutboundComment();
assert.deepEqual(comments, [
	{
		issueNumber: 42,
		body: 'Reply from a Bapx agent through Chat SDK.',
	},
]);

async function sendWebhookWhenReady() {
	const deadline = Date.now() + 10000;
	while (Date.now() < deadline) {
		try {
			return await fetch(new URL('/webhooks/github', baseUrl), {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'x-github-event': 'issue_comment',
					'x-hub-signature-256': signature,
				},
				body,
			});
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
	}
	throw new Error('Timed out waiting for the Bapx server.');
}

async function waitForOutboundComment() {
	const deadline = Date.now() + 10000;
	while (Date.now() < deadline) {
		const result = await fetch(new URL('/test/outbound-comments', baseUrl));
		if (result.ok) {
			const comments = await result.json();
			if (comments.length > 0) return comments;
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	throw new Error('Timed out waiting for the Chat SDK outbound comment.');
}
