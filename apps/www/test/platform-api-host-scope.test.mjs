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

// The session cookie is scoped Domain=.bapx.in, so every bapX hostname carries
// it — including a customer's hosted project subdomain, where the customer's own
// script runs. Same-origin is therefore not the same as "on Platform": a page on
// such a hostname posting to its own /api/platform/* path satisfies the Origin
// check, because that check compares Origin to the request's own Host.
//
// These tests hold the host boundary that stops it.

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CUSTOMER_HOST = 'acme-project.bapx.in';

async function availablePort() {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const { port } = server.address();
			server.close(() => resolve(port));
		});
	});
}

async function request(port, { method = 'GET', pathname = '/', host, headers = {}, body } = {}) {
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
			response.on('end', () => resolve({ status: response.statusCode, body: responseBody }));
		});
		outgoing.once('error', reject);
		if (body) outgoing.write(body);
		outgoing.end();
	});
}

async function waitForServer(port) {
	for (let attempt = 0; attempt < 40; attempt += 1) {
		try {
			return await request(port, { host: 'platform.bapx.in' });
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 25));
		}
	}
	throw new Error('web server did not start');
}

describe('Platform APIs are scoped to hosts that run no customer code', () => {
	let server;
	let port;
	let workspaceRoot;
	let cookie;

	before(async () => {
		workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bapx-platform-host-'));
		fs.writeFileSync(path.join(workspaceRoot, 'OKF.md'), '# Test OKF\n');
		const store = createPlatformStore({ workspaceRoot });
		const { account } = await store.loginWithGitHub({
			id: '2001',
			login: 'host-scope-user',
			name: 'Host Scope User',
			email: 'host-scope@example.test',
		});
		cookie = `bapx_session=${store.createSession(account.id).token}`;
		port = await availablePort();
		server = spawn(process.execPath, ['server.mjs'], {
			cwd: appRoot,
			env: {
				...process.env,
				PORT: String(port),
				WORKSPACE_ROOT: workspaceRoot,
				BAPX_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
			},
			stdio: 'ignore',
		});
		await waitForServer(port);
	});

	after(() => {
		server?.kill();
		fs.rmSync(workspaceRoot, { recursive: true, force: true });
	});

	// A customer subdomain is same-origin with itself, so the Origin guard passes.
	// Only the host boundary stops this from issuing a usable plaintext key.
	it('refuses to issue an API key for a customer-controlled bapX hostname', async () => {
		const response = await request(port, {
			method: 'POST',
			pathname: '/api/platform/api-keys',
			host: CUSTOMER_HOST,
			headers: {
				cookie,
				origin: `https://${CUSTOMER_HOST}`,
				'content-type': 'application/json',
			},
			body: JSON.stringify({ name: 'stolen' }),
		});
		assert.notEqual(response.status, 200, 'a customer hostname must not issue keys');
		assert.doesNotMatch(response.body, /bapx_sk_/, 'no key secret may reach a customer hostname');
	});

	// GET is exempt from the Origin guard entirely, so listing is reachable with
	// nothing but the shared cookie. The host boundary is the only thing in the way.
	it('refuses to list API keys for a customer-controlled bapX hostname', async () => {
		const response = await request(port, {
			pathname: '/api/platform/api-keys',
			host: CUSTOMER_HOST,
			headers: { cookie },
		});
		assert.notEqual(response.status, 200, 'a customer hostname must not list keys');
		assert.doesNotMatch(response.body, /"keys"/, 'no key metadata may reach a customer hostname');
	});

	it('refuses to read or replace connector credentials for a customer-controlled bapX hostname', async () => {
		const listed = await request(port, {
			pathname: '/api/platform/connections',
			host: CUSTOMER_HOST,
			headers: { cookie },
		});
		assert.notEqual(listed.status, 200, 'a customer hostname must not list connections');

		const written = await request(port, {
			method: 'POST',
			pathname: '/api/platform/connections',
			host: CUSTOMER_HOST,
			headers: {
				cookie,
				origin: `https://${CUSTOMER_HOST}`,
				'content-type': 'application/json',
			},
			body: JSON.stringify({ slug: 'openai', name: 'OpenAI', category: 'models', credential: 'sk-attacker' }),
		});
		assert.notEqual(written.status, 200, 'a customer hostname must not write connections');
	});

	// The boundary must not be drawn so tightly that it breaks Platform itself.
	// The root host serves /platform/ as well as platform.bapx.in does.
	for (const host of ['platform.bapx.in', 'bapx.in', 'www.bapx.in']) {
		it(`still serves the Platform API on ${host}`, async () => {
			const response = await request(port, {
				pathname: '/api/platform/api-keys',
				host,
				headers: { cookie },
			});
			assert.equal(response.status, 200, `${host} serves the Platform UI and must reach its API`);
			assert.match(response.body, /"keys"/);
		});
	}
});
