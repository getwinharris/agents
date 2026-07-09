import { registerProvider } from '@bapX/runtime';
import { bapX } from '@bapX/runtime/routing';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';

registerProvider('react-chat-example', {
	api: 'react-chat-example',
	baseUrl: '',
});

const app = new Hono();
app.route('/api', bapX());
app.use('*', serveStatic({ root: './dist/client' }));
app.get('*', serveStatic({ path: './dist/client/index.html' }));

export default app;
