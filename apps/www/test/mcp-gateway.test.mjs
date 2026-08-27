import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createPlatformStore } from '../src/server/platform-store.mjs';
import { createApiKeyStore } from '../src/server/api-gateway.mjs';

// The MCP endpoint is the inbound bridge external agents use. It is reached with
// a bapX API key, so tenancy is decided at the door, and it speaks Streamable
// HTTP (MCP 2025-06-18) which requires one path serving POST and GET.

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function availablePort() {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)); });
	});
}

async function request(port, { method = 'POST', pathname = '/mcp', headers = {}, body } = {}) {
	return new Promise((resolve, reject) => {
		const outgoing = http.request({ host: '127.0.0.1', port, path: pathname, method, headers: { host: 'api.bapx.in', ...headers } }, (response) => {
			let text = '';
			response.setEncoding('utf8');
			response.on('data', (chunk) => { text += chunk; });
			response.on('end', () => {
				let parsed = null;
				try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
				resolve({ status: response.statusCode, headers: response.headers, body: parsed, text });
			});
		});
		outgoing.once('error', reject);
		if (body !== undefined) outgoing.write(typeof body === 'string' ? body : JSON.stringify(body));
		outgoing.end();
	});
}

function rpc(method, params, id = 1) {
	return { jsonrpc: '2.0', id, method, ...(params ? { params } : {}) };
}

describe('MCP endpoint on api.bapx.in', () => {
	let server;
	let port;
	let workspaceRoot;
	let secret;
	let modelsSecret;
	let plane;

	before(async () => {
		workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bapx-mcp-'));
		fs.writeFileSync(path.join(workspaceRoot, 'OKF.md'), '# Test OKF\n');
		const store = createPlatformStore({ workspaceRoot });
		const { account } = await store.loginWithGitHub({ id: '4001', login: 'mcp-user', name: 'MCP User', email: 'mcp@example.test' });
		const keys = createApiKeyStore({ workspaceRoot });
		({ secret } = keys.issue(account.id, 'mcp-test', 'mcp'));
		// A models-scoped key must be refused here — that separation is the point.
		modelsSecret = keys.issue(account.id, 'models-test', 'models').secret;

		// Stand-in API plane, so the tools are exercised end to end rather than mocked away.
		const planePort = await availablePort();
		plane = http.createServer((incoming, response) => {
			if (incoming.url === '/v1/models') {
				response.writeHead(200, { 'content-type': 'application/json' });
				response.end(JSON.stringify({ data: [{ id: 'openai/gpt-4o-mini' }, { id: 'anthropic/claude-sonnet-5' }] }));
				return;
			}
			if (incoming.url === '/v1/chat/completions') {
				response.writeHead(200, { 'content-type': 'application/json' });
				response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'plane answered' } }] }));
				return;
			}
			response.writeHead(404); response.end('{}');
		});
		await new Promise((resolve) => plane.listen(planePort, '127.0.0.1', resolve));

		port = await availablePort();
		server = spawn(process.execPath, ['server.mjs'], {
			cwd: appRoot,
			env: { ...process.env, PORT: String(port), WORKSPACE_ROOT: workspaceRoot, BAPX_API_PLANE_ORIGIN: `http://127.0.0.1:${planePort}` },
			stdio: 'ignore',
		});
		for (let attempt = 0; attempt < 60; attempt += 1) {
			try { await request(port, { method: 'GET', pathname: '/mcp' }); break; } catch { await new Promise((r) => setTimeout(r, 25)); }
		}
	});

	after(() => {
		server?.kill();
		plane?.close();
		fs.rmSync(workspaceRoot, { recursive: true, force: true });
	});

	const auth = () => ({ authorization: `Bearer ${secret}`, 'content-type': 'application/json' });

	it('refuses a models-scoped key with 403, not 401', async () => {
		const response = await request(port, {
			headers: { authorization: `Bearer ${modelsSecret}`, 'content-type': 'application/json' },
			body: rpc('initialize'),
		});
		assert.equal(response.status, 403, 'a models key must not reach MCP');
		assert.equal(response.body.error.type, 'insufficient_scope');
	});

	it('rejects an unauthenticated call with 401 and a WWW-Authenticate challenge', async () => {
		const response = await request(port, { headers: { 'content-type': 'application/json' }, body: rpc('initialize') });
		assert.equal(response.status, 401);
		assert.match(String(response.headers['www-authenticate'] || ''), /Bearer/);
	});

	it('answers GET with 405 because it offers no server-initiated stream', async () => {
		const response = await request(port, { method: 'GET', headers: auth() });
		assert.equal(response.status, 405);
		assert.match(String(response.headers.allow || ''), /POST/);
	});

	it('rejects a browser origin that is not a bapX surface', async () => {
		const response = await request(port, { headers: { ...auth(), origin: 'https://evil.example' }, body: rpc('initialize') });
		assert.equal(response.status, 403);
	});

	it('rejects an unsupported MCP-Protocol-Version with 400', async () => {
		const response = await request(port, { headers: { ...auth(), 'mcp-protocol-version': '1999-01-01' }, body: rpc('initialize') });
		assert.equal(response.status, 400);
	});

	it('completes initialize with a negotiated version and tool capability', async () => {
		const response = await request(port, { headers: auth(), body: rpc('initialize') });
		assert.equal(response.status, 200);
		assert.equal(response.body.jsonrpc, '2.0');
		assert.equal(response.body.result.protocolVersion, '2025-06-18');
		assert.ok(response.body.result.capabilities.tools, 'must advertise tools');
		assert.equal(response.body.result.serverInfo.name, 'bapx');
	});

	it('answers a notification with 202 and no body', async () => {
		const response = await request(port, { headers: auth(), body: { jsonrpc: '2.0', method: 'notifications/initialized' } });
		assert.equal(response.status, 202);
		assert.equal(response.text, '');
	});

	it('lists tools with input schemas', async () => {
		const response = await request(port, { headers: auth(), body: rpc('tools/list') });
		const names = response.body.result.tools.map((tool) => tool.name).sort();
		assert.deepEqual(names, ['chat_completion', 'list_models']);
		for (const tool of response.body.result.tools) {
			assert.equal(tool.inputSchema.type, 'object', `${tool.name} needs an object schema`);
			assert.ok(tool.description, `${tool.name} needs a description`);
		}
	});

	it('calls list_models through the plane', async () => {
		const response = await request(port, { headers: auth(), body: rpc('tools/call', { name: 'list_models' }) });
		assert.equal(response.status, 200);
		assert.ok(!response.body.result.isError, 'list_models must succeed');
		assert.match(response.body.result.content[0].text, /openai\/gpt-4o-mini/);
	});

	it('calls chat_completion through the plane', async () => {
		const response = await request(port, {
			headers: auth(),
			body: rpc('tools/call', { name: 'chat_completion', arguments: { model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }] } }),
		});
		assert.ok(!response.body.result.isError);
		assert.match(response.body.result.content[0].text, /plane answered/);
	});

	// A tool failure is reported inside the result so the model can read it,
	// not as a JSON-RPC protocol error.
	it('reports bad tool arguments as a tool error, not a protocol error', async () => {
		const response = await request(port, { headers: auth(), body: rpc('tools/call', { name: 'chat_completion', arguments: { model: 'x' } }) });
		assert.equal(response.status, 200);
		assert.ok(response.body.result.isError, 'must be a tool-level error');
		assert.equal(response.body.error, undefined);
	});

	it('rejects an unknown tool and an unknown method', async () => {
		const unknownTool = await request(port, { headers: auth(), body: rpc('tools/call', { name: 'rm_rf' }) });
		assert.equal(unknownTool.body.error.code, -32602);
		const unknownMethod = await request(port, { headers: auth(), body: rpc('resources/list') });
		assert.equal(unknownMethod.body.error.code, -32601);
	});

	it('returns a JSON-RPC parse error for malformed JSON', async () => {
		const response = await request(port, { headers: auth(), body: '{not json' });
		assert.equal(response.status, 400);
		assert.equal(response.body.error.code, -32700);
	});
});
