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
const postsFile = path.join(appRoot, 'data', 'posts.json');
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
	let previousPosts;
	let workspaceRoot;
	let siblingRoot;
	let cookie;
	let nonAdminCookie;
	let runtime;
	let runtimePort;

	before(async () => {
		workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bapx-agents-routing-'));
		siblingRoot = `${workspaceRoot}-sibling`;
		fs.mkdirSync(siblingRoot);
		fs.writeFileSync(path.join(workspaceRoot, 'OKF.md'), '# Test OKF\n');
		fs.writeFileSync(path.join(workspaceRoot, 'root-secret.md'), 'not customer visible\n');
		fs.writeFileSync(path.join(siblingRoot, 'sibling-secret.md'), 'outside authorized root\n');
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
		previousPosts = fs.existsSync(postsFile) ? fs.readFileSync(postsFile) : undefined;
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
		fs.rmSync(siblingRoot, { recursive: true });
		if (previousEntry === undefined) fs.rmSync(path.join(appRoot, 'dist'), { recursive: true });
		else fs.writeFileSync(agentsEntry, previousEntry);
		if (previousPosts === undefined) fs.rmSync(postsFile, { force: true });
		else fs.writeFileSync(postsFile, previousPosts);
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

	it('opens the GitHub App manifest setup flow from the auth surface', async () => {
		const response = await request(port, {
			host: 'bapx.in',
			pathname: '/api/auth/oauth/github/manifest',
		});
		assert.equal(response.status, 303);
		const location = new URL(response.headers.location);
		assert.equal(location.origin, 'https://github.com');
		assert.equal(location.pathname, '/organizations/bapXai/settings/apps/new');
		const manifest = JSON.parse(location.searchParams.get('manifest'));
		assert.equal(manifest.name, 'bapX');
		assert.equal(manifest.redirect_url, 'https://bapx.in/login/');
		assert.equal(manifest.hook_attributes.url, 'https://bapx.in/api/channels/github/webhook');
		assert.deepEqual(manifest.default_permissions, {
			metadata: 'read',
			administration: 'write',
			contents: 'write',
			issues: 'write',
			members: 'write',
			organization_projects: 'write',
			pull_requests: 'write',
			repository_projects: 'write',
			workflows: 'write',
		});
	});

	it('does not persist an external OAuth return destination', async () => {
		const response = await request(port, {
			host: 'bapx.in',
			pathname: '/api/auth/oauth/github?returnTo=https%3A%2F%2Fevil.example%2F',
		});
		assert.equal(response.status, 303);
		assert.doesNotMatch(response.headers['set-cookie']?.join(';') ?? '', /bapx_oauth_return_to=/);
	});

	it('exchanges the central session for a single-use Admin host session', async () => {
		const returnTo = 'https://admin.bapx.in/projects?source=handoff-test';
		const anonymousAdmin = await request(port, { host: 'admin.bapx.in', pathname: '/projects?source=handoff-test' });
		assert.equal(anonymousAdmin.status, 303);
		assert.equal(
			anonymousAdmin.headers.location,
			`https://bapx.in/api/auth/admin?returnTo=${encodeURIComponent(returnTo)}`,
		);

		const anonymousIssuer = await request(port, {
			host: 'bapx.in',
			pathname: `/api/auth/admin?returnTo=${encodeURIComponent(returnTo)}`,
		});
		assert.equal(anonymousIssuer.status, 303);
		assert.equal(
			anonymousIssuer.headers.location,
			`https://bapx.in/login/?returnTo=${encodeURIComponent(returnTo)}`,
		);

		const issued = await request(port, {
			host: 'bapx.in',
			pathname: `/api/auth/admin?returnTo=${encodeURIComponent(returnTo)}`,
			headers: { cookie },
		});
		assert.equal(issued.status, 200);
		assert.match(issued.headers['content-type'], /^text\/html/);
		assert.equal(issued.headers['cache-control'], 'no-store');
		assert.equal(issued.headers['referrer-policy'], 'no-referrer');
		assert.match(issued.body, /action="https:\/\/admin\.bapx\.in\/api\/auth\/admin\/handoff"/);
		const token = issued.body.match(/name="token" value="([^"]+)"/)?.[1];
		assert.ok(token);

		const form = new URLSearchParams({ token, returnTo }).toString();
		const wrongOrigin = await request(port, {
			method: 'POST',
			host: 'admin.bapx.in',
			pathname: '/api/auth/admin/handoff',
			headers: { origin: 'https://evil.example', 'content-type': 'application/x-www-form-urlencoded' },
			body: form,
		});
		assert.equal(wrongOrigin.status, 403);
		assert.deepEqual(JSON.parse(wrongOrigin.body), { error: 'cross_origin_forbidden' });

		const redeemed = await request(port, {
			method: 'POST',
			host: 'admin.bapx.in',
			pathname: '/api/auth/admin/handoff',
			headers: { origin: 'https://bapx.in', 'content-type': 'application/x-www-form-urlencoded' },
			body: form,
		});
		assert.equal(redeemed.status, 303);
		assert.equal(redeemed.headers.location, returnTo);
		assert.match(redeemed.headers['set-cookie']?.join(';') ?? '', /bapx_session=/);
		const adminCookie = redeemed.headers['set-cookie'][0].split(';')[0];
		const shell = await request(port, {
			host: 'admin.bapx.in',
			pathname: '/projects?source=handoff-test',
			headers: { cookie: adminCookie },
		});
		assert.equal(shell.status, 200);
		assert.equal(shell.body, marker);

		const replay = await request(port, {
			method: 'POST',
			host: 'admin.bapx.in',
			pathname: '/api/auth/admin/handoff',
			headers: { origin: 'https://bapx.in', 'content-type': 'application/x-www-form-urlencoded' },
			body: form,
		});
		assert.equal(replay.status, 401);
		assert.deepEqual(JSON.parse(replay.body), { error: 'authentication_required' });
	});

	it('denies Admin handoff issuance and shell access to a non-Admin account', async () => {
		const issuance = await request(port, {
			host: 'bapx.in',
			pathname: '/api/auth/admin?returnTo=https%3A%2F%2Fadmin.bapx.in%2F',
			headers: { cookie: nonAdminCookie },
		});
		assert.equal(issuance.status, 403);
		assert.deepEqual(JSON.parse(issuance.body), { error: 'admin_forbidden' });

		const shell = await request(port, { host: 'admin.bapx.in', headers: { cookie: nonAdminCookie } });
		assert.equal(shell.status, 403);
		assert.equal(shell.body, 'Admin access is forbidden');
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
		const unauthorized = await request(port, { host: 'admin.bapx.in', pathname: '/api/agents/main/conversation-1?view=updates' });
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

	it('protects Admin workspace reads and writes through the existing authorization boundary', async () => {
		const unauthenticated = await request(port, { host: 'admin.bapx.in', pathname: '/api/ws/tree' });
		const forbidden = await request(port, {
			host: 'admin.bapx.in',
			pathname: '/api/ws/tree',
			headers: { cookie: nonAdminCookie },
		});
		const tree = await request(port, { host: 'admin.bapx.in', pathname: '/api/ws/tree', headers: { cookie } });
		const read = await request(port, { host: 'admin.bapx.in', pathname: '/api/ws/file?path=OKF.md', headers: { cookie } });
		const traversal = await request(port, {
			host: 'admin.bapx.in',
			pathname: `/api/ws/file?path=${encodeURIComponent(`../${path.basename(siblingRoot)}/sibling-secret.md`)}`,
			headers: { cookie },
		});
		const writeBody = JSON.stringify({ path: 'admin-written.md', content: '# Admin write\n' });
		const missingOrigin = await request(port, {
			method: 'PUT',
			host: 'admin.bapx.in',
			pathname: '/api/ws/file',
			headers: { cookie, 'content-type': 'application/json' },
			body: writeBody,
		});
		const crossOrigin = await request(port, {
			method: 'PUT',
			host: 'admin.bapx.in',
			pathname: '/api/ws/file',
			headers: { cookie, origin: 'https://evil.example', 'content-type': 'application/json' },
			body: writeBody,
		});

		assert.equal(unauthenticated.status, 401);
		assert.deepEqual(JSON.parse(unauthenticated.body), { error: 'authentication_required' });
		assert.equal(forbidden.status, 403);
		assert.deepEqual(JSON.parse(forbidden.body), { error: 'admin_forbidden' });
		assert.equal(tree.status, 200);
		assert.match(tree.body, /root-secret\.md/);
		assert.equal(read.status, 200);
		assert.equal(JSON.parse(read.body).content, '# Test OKF\n');
		assert.equal(traversal.status, 403);
		assert.deepEqual(JSON.parse(traversal.body), { error: 'Forbidden' });
		assert.equal(missingOrigin.status, 403);
		assert.deepEqual(JSON.parse(missingOrigin.body), { error: 'cross_origin_forbidden' });
		assert.equal(crossOrigin.status, 403);
		assert.deepEqual(JSON.parse(crossOrigin.body), { error: 'cross_origin_forbidden' });
		assert.equal(fs.existsSync(path.join(workspaceRoot, 'admin-written.md')), false);

		const write = await request(port, {
			method: 'PUT',
			host: 'admin.bapx.in',
			pathname: '/api/ws/file',
			headers: { cookie, origin: 'https://admin.bapx.in', 'content-type': 'application/json' },
			body: writeBody,
		});
		assert.equal(write.status, 200);
		assert.deepEqual(JSON.parse(write.body), { ok: true, path: 'admin-written.md' });
		assert.equal(fs.readFileSync(path.join(workspaceRoot, 'admin-written.md'), 'utf8'), '# Admin write\n');
		assert.equal(write.headers['access-control-allow-origin'], undefined);
	});

	it('protects Admin content mutations and accepts only the exact Admin origin', async () => {
		const body = JSON.stringify({
			slug: 'authorization-route-test',
			title: 'Authorization route test',
			content: 'temporary test post',
		});
		const unauthenticated = await request(port, {
			method: 'POST', host: 'admin.bapx.in', pathname: '/api/posts', headers: { 'content-type': 'application/json' }, body,
		});
		const forbidden = await request(port, {
			method: 'POST', host: 'admin.bapx.in', pathname: '/api/posts',
			headers: { cookie: nonAdminCookie, origin: 'https://admin.bapx.in', 'content-type': 'application/json' }, body,
		});
		const missingOrigin = await request(port, {
			method: 'POST', host: 'admin.bapx.in', pathname: '/api/posts',
			headers: { cookie, 'content-type': 'application/json' }, body,
		});
		const crossOrigin = await request(port, {
			method: 'POST', host: 'admin.bapx.in', pathname: '/api/posts',
			headers: { cookie, origin: 'https://admin.bapx.in.evil.example', 'content-type': 'application/json' }, body,
		});
		const created = await request(port, {
			method: 'POST', host: 'admin.bapx.in', pathname: '/api/posts',
			headers: { cookie, origin: 'https://admin.bapx.in', 'content-type': 'application/json' }, body,
		});
		const removed = await request(port, {
			method: 'DELETE', host: 'admin.bapx.in', pathname: '/api/posts/authorization-route-test',
			headers: { cookie, origin: 'https://admin.bapx.in' },
		});

		assert.equal(unauthenticated.status, 401);
		assert.deepEqual(JSON.parse(unauthenticated.body), { error: 'authentication_required' });
		assert.equal(forbidden.status, 403);
		assert.deepEqual(JSON.parse(forbidden.body), { error: 'admin_forbidden' });
		assert.equal(missingOrigin.status, 403);
		assert.deepEqual(JSON.parse(missingOrigin.body), { error: 'cross_origin_forbidden' });
		assert.equal(crossOrigin.status, 403);
		assert.deepEqual(JSON.parse(crossOrigin.body), { error: 'cross_origin_forbidden' });
		assert.equal(created.status, 201);
		assert.equal(JSON.parse(created.body).post.slug, 'authorization-route-test');
		assert.equal(created.headers['access-control-allow-origin'], undefined);
		assert.equal(removed.status, 200);
		assert.deepEqual(JSON.parse(removed.body), { ok: true });
	});

	it('limits the customer workspace API to the signed-in user business', async () => {
		const response = await request(port, { pathname: '/api/ws/tree', headers: { cookie } });
		assert.equal(response.status, 200);
		assert.doesNotMatch(response.body, /root-secret/);
		assert.match(response.body, /DESIGN\.md/);
	});
});
