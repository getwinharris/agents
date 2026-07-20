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

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const agentsEntry = path.join(appRoot, 'dist', 'admin', 'index.html');
const marker = '<!doctype html><title>bapX operating surface</title>';

async function availablePort() {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			server.close(() => resolve(address.port));
		});
	});
}

async function request(port, { method = 'GET', pathname = '/', host = 'agents.bapx.in', headers = {}, body } = {}) {
	return new Promise((resolve, reject) => {
		const outgoing = http.request({
			host: '127.0.0.1',
			port,
			path: pathname,
			method,
			headers: { host, ...headers },
		}, (response) => {
			let responseBody = '';
			response.setEncoding('utf8');
			response.on('data', (chunk) => { responseBody += chunk; });
			response.on('end', () => resolve({
				status: response.statusCode,
				headers: response.headers,
				body: responseBody,
			}));
		});
		outgoing.once('error', reject);
		if (body) outgoing.write(body);
		outgoing.end();
	});
}

async function waitForServer(port) {
	for (let attempt = 0; attempt < 40; attempt += 1) {
		try {
			return await request(port);
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 25));
		}
	}
	throw new Error('web server did not start');
}

describe('Agents host routing', () => {
	let server;
	let port;
	let previousEntry;
	let workspaceRoot;
	let cookie;
	let nonAdminCookie;
	let runtime;
	let runtimePort;

	before(async () => {
		workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bapx-agents-routing-'));
		fs.writeFileSync(path.join(workspaceRoot, 'OKF.md'), '# Test OKF\n');
		fs.writeFileSync(path.join(workspaceRoot, 'root-secret.md'), 'not customer visible\n');
		const store = createPlatformStore({ workspaceRoot });
		const { account } = await store.loginWithGitHub({
			id: '1001',
			login: 'routing-user',
			name: 'Routing User',
			email: 'routing@example.test',
		});
		const { account: nonAdminAccount } = await store.loginWithGitHub({
			id: '1002',
			login: 'non-admin-routing-user',
			name: 'Non-Admin Routing User',
			email: 'non-admin-routing@example.test',
		});
		cookie = `bapx_session=${store.createSession(account.id).token}`;
		nonAdminCookie = `bapx_session=${store.createSession(nonAdminAccount.id).token}`;
		runtimePort = await availablePort();
		runtime = http.createServer((request, response) => {
			assert.equal(request.headers['x-bapx-account'], 'routing-user');
			assert.equal(request.headers['x-bapx-runtime-token'], 'runtime-test-token');
			response.writeHead(200, { 'content-type': 'text/event-stream' });
			response.end('event: message\ndata: {"type":"ready"}\n\n');
		});
		await new Promise((resolve) => runtime.listen(runtimePort, '127.0.0.1', resolve));
		previousEntry = fs.existsSync(agentsEntry) ? fs.readFileSync(agentsEntry) : undefined;
		fs.mkdirSync(path.dirname(agentsEntry), { recursive: true });
		fs.writeFileSync(agentsEntry, marker);
		port = await availablePort();
		server = spawn(process.execPath, ['server.mjs'], {
			cwd: appRoot,
			env: {
				...process.env,
				PORT: String(port),
				WORKSPACE_ROOT: workspaceRoot,
				AGENTS_RUNTIME_ORIGIN: `http://127.0.0.1:${runtimePort}`,
				BAPX_RUNTIME_TOKEN: 'runtime-test-token',
				BAPX_ADMIN_GITHUB_USER_IDS: '1001',
				GITHUB_CLIENT_ID: 'test-client-id',
			},
			stdio: 'ignore',
		});
	});

	after(() => {
		server?.kill();
		runtime?.close();
		fs.rmSync(workspaceRoot, { recursive: true });
		if (previousEntry === undefined) fs.rmSync(path.join(appRoot, 'dist'), { recursive: true });
		else fs.writeFileSync(agentsEntry, previousEntry);
	});

	it('redirects to sign in when the Agents hostname has no customer session', async () => {
		const response = await waitForServer(port);

		assert.equal(response.status, 303);
		assert.equal(response.headers.location, 'https://bapx.in/login/?returnTo=https%3A%2F%2Fagents.bapx.in%2F');
	});

	it('answers an unauthenticated Agents HEAD health check without serving the shell', async () => {
		const response = await request(port, { method: 'HEAD' });

		assert.equal(response.status, 200);
		assert.equal(response.body, '');
	});

	it('carries an allowlisted Agents destination into the GitHub OAuth flow', async () => {
		const returnTo = 'https://agents.bapx.in/conversation/customer-check';
		const response = await request(port, {
			host: 'bapx.in',
			pathname: `/api/auth/oauth/github?returnTo=${encodeURIComponent(returnTo)}`,
		});

		assert.equal(response.status, 303);
		assert.match(response.headers.location, /^https:\/\/github\.com\/login\/oauth\/authorize/);
		assert.match(response.headers['set-cookie']?.join(';') ?? '', /bapx_oauth_return_to=/);
	});

	it('does not persist an external OAuth return destination', async () => {
		const response = await request(port, {
			host: 'bapx.in',
			pathname: '/api/auth/oauth/github?returnTo=https%3A%2F%2Fevil.example%2F',
		});

		assert.equal(response.status, 303);
		assert.doesNotMatch(response.headers['set-cookie']?.join(';') ?? '', /bapx_oauth_return_to=/);
	});

	it('serves the shared operating shell when the Agents hostname has a customer session', async () => {
		const response = await request(port, { headers: { cookie } });

		assert.equal(response.status, 200);
		assert.equal(response.body, marker);
	});

	it('proxies the main-agent stream only after adding authenticated gateway headers', async () => {
		const response = await request(port, {
			pathname: '/api/agents/main/conversation-1?view=updates',
			headers: { cookie },
		});

		assert.equal(response.status, 200);
		assert.equal(response.headers['content-type'], 'text/event-stream');
		assert.match(response.body, /"type":"ready"/);
	});

	it('uses the same entitled main-agent gateway from the Admin hostname', async () => {
		const unauthorized = await request(port, {
			host: 'admin.bapx.in',
			pathname: '/api/agents/main/conversation-1?view=updates',
		});
		const forbidden = await request(port, {
			host: 'admin.bapx.in',
			pathname: '/api/agents/main/conversation-1?view=updates',
			headers: { cookie: nonAdminCookie },
		});
		const authorized = await request(port, {
			host: 'admin.bapx.in',
			pathname: '/api/agents/main/conversation-1?view=updates',
			headers: { cookie },
		});

		assert.equal(unauthorized.status, 401);
		assert.deepEqual(JSON.parse(unauthorized.body), { error: 'authentication_required' });
		assert.equal(forbidden.status, 403);
		assert.deepEqual(JSON.parse(forbidden.body), { error: 'admin_forbidden' });
		assert.equal(authorized.status, 200);
		assert.match(authorized.body, /"type":"ready"/);
	});

	it('limits the customer workspace API to the signed-in user business', async () => {
		const response = await request(port, {
			pathname: '/api/ws/tree',
			headers: { cookie },
		});

		assert.equal(response.status, 200);
		assert.doesNotMatch(response.body, /root-secret/);
		assert.match(response.body, /DESIGN\.md/);
	});
});