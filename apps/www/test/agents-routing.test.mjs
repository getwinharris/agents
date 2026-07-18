import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

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

	before(async () => {
		workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bapx-agents-routing-'));
		fs.writeFileSync(path.join(workspaceRoot, 'OKF.md'), '# Test OKF\n');
		previousEntry = fs.existsSync(agentsEntry) ? fs.readFileSync(agentsEntry) : undefined;
		fs.mkdirSync(path.dirname(agentsEntry), { recursive: true });
		fs.writeFileSync(agentsEntry, marker);
		port = await availablePort();
		server = spawn(process.execPath, ['server.mjs'], {
			cwd: appRoot,
			env: { ...process.env, PORT: String(port), WORKSPACE_ROOT: workspaceRoot },
			stdio: 'ignore',
		});
	});

	after(() => {
		server?.kill();
		fs.rmSync(workspaceRoot, { recursive: true });
		if (previousEntry === undefined) fs.rmSync(path.join(appRoot, 'dist'), { recursive: true });
		else fs.writeFileSync(agentsEntry, previousEntry);
	});

	it('redirects to sign in when the Agents hostname has no customer session', async () => {
		const response = await waitForServer(port);

		assert.equal(response.status, 303);
		assert.equal(response.headers.location, 'https://bapx.in/login/?returnTo=https%3A%2F%2Fagents.bapx.in%2F');
	});

	it('serves the shared operating shell when the Agents hostname has a customer session', async () => {
		const form = new URLSearchParams({
			username: 'routing-user',
			name: 'Routing User',
			email: 'routing@example.test',
			password: 'correct-horse-battery-staple',
			business_name: 'Routing Business',
			business_slug: 'routing-business',
		});
		const signup = await request(port, {
			method: 'POST',
			pathname: '/api/auth/signup',
			host: 'bapx.in',
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
				'content-length': String(Buffer.byteLength(form.toString())),
			},
			body: form.toString(),
		});
		const cookie = signup.headers['set-cookie']?.[0]?.split(';', 1)[0];

		assert.equal(signup.status, 303);
		assert.ok(cookie);
		const response = await request(port, { headers: { cookie } });

		assert.equal(response.status, 200);
		assert.equal(response.body, marker);
	});
});
