import { registerProvider } from '@bapX/runtime';
import { flue } from '@bapX/runtime/routing';
import { Hono } from 'hono';
import assistant from './agents/assistant.ts';
import { bot, registerChatHandlers } from './chat.ts';

registerProvider('chat-sdk-example', {
	api: 'chat-sdk-example',
	baseUrl: '',
});
registerChatHandlers(assistant);

const app = new Hono();
const outboundComments: Array<{ issueNumber: number; body: string }> = [];

app.post('/webhooks/github', (c) =>
	bot.webhooks.github(c.req.raw, {
		waitUntil: (task) => {
			try {
				c.executionCtx.waitUntil(task);
			} catch {
				void task;
			}
		},
	}),
);

app.post('/api/github/repos/:owner/:repo/issues/:issueNumber/comments', async (c) => {
	const issueNumber = Number(c.req.param('issueNumber'));
	const payload = await c.req.json<{ body?: string }>();
	const body = typeof payload.body === 'string' ? payload.body : '';
	outboundComments.push({ issueNumber, body });
	return c.json({
		id: outboundComments.length,
		body,
		user: { id: 1, login: 'flue-bot', type: 'Bot' },
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
	});
});

app.get('/test/outbound-comments', (c) => c.json(outboundComments));
app.route('/', flue());

export default app;
