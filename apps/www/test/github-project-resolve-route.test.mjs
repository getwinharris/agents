import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(testDir, '..');
const preload = path.join(testDir, 'fixtures', 'github-project-resolve-fetch.mjs');

function freePort() {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			server.close((error) => {
				if (error) reject(error);
				else resolve(address.port);
			});
		});
	});
}

function writeJson(file, value) {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function tree(root) {
	if (!fs.existsSync(root)) return [];
	const entries = [];
	for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
		const fullPath = path.join(root, entry.name);
		const relative = path.relative(root, fullPath);
		entries.push(relative);
		if (entry.isDirectory()) {
			for (const nested of tree(fullPath)) entries.push(path.join(relative, nested));
		}
	}
	return entries.sort();
}

function request(port, { cookie, origin } = {}) {
	const body = JSON.stringify({ repositoryUrl: 'https://github.com/submitted-owner/submitted-repository' });
	return new Promise((resolve, reject) => {
		const req = http.request({
			host: '127.0.0.1',
			port,
			method: 'POST',
			path: '/api/projects/resolve',
			headers: {
				Host: 'admin.bapx.in',
				'Content-Type': 'application/json',
				'Content-Length': Buffer.byteLength(body),
				...(origin ? { Origin: origin } : {}),
				...(cookie ? { Cookie: `bapx_session=${cookie}` } : {}),
			},
		}, (res) => {
			let responseBody = '';
			res.setEncoding('utf8');
			res.on('data', (chunk) => { responseBody += chunk; });
			res.on('end', () => {
				resolve({ status: res.statusCode, body: JSON.parse(responseBody) });
			});
		});
		req.once('error', reject);
		req.end(body);
	});
}

async function waitForServer(port, child) {
	const deadline = Date.now() + 10_000;
	while (Date.now() < deadline) {
		if (child.exitCode !== null) throw new Error(`server exited with ${child.exitCode}`);
		try {
			await new Promise((resolve, reject) => {
				const req = http.get({ host: '127.0.0.1', port, path: '/', headers: { Host: 'bapx.in' } }, (res) => {
					res.resume();
					res.on('end', resolve);
				});
				req.once('error', reject);
			});
			return;
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 25));
		}
	}
	throw new Error('server did not start');
}

test('protects and executes repository resolution through the real Admin HTTP route without workspace mutation', async (t) => {
	const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bapx-project-resolve-route-'));
	const logFile = path.join(os.tmpdir(), `bapx-project-resolve-fetch-${process.pid}-${Date.now()}.jsonl`);
	const accountId = 'admin-account';
	const sessionToken = 'admin-session-token';
	const now = new Date().toISOString();
	writeJson(path.join(workspaceRoot, 'data/platform/collections/accounts.json'), {
		schemaVersion: 2,
		accounts: [{
			id: accountId,
			username: 'admin',
			name: 'Admin',
			email: 'admin@example.com',
			providers: [{ name: 'github', id: '12345', login: 'admin' }],
			createdAt: now,
			updatedAt: now,
		}],
	});
	writeJson(path.join(workspaceRoot, 'data/platform/collections/sessions.json'), {
		schemaVersion: 2,
		sessions: [{ token: sessionToken, accountId, createdAt: now }],
	});
	fs.writeFileSync(path.join(workspaceRoot, 'OKF.md'), '# Test\n', 'utf8');

	const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
	const port = await freePort();
	const child = spawn(process.execPath, ['--import', preload, 'server.mjs'], {
		cwd: appRoot,
		env: {
			...process.env,
			PORT: String(port),
			WORKSPACE_ROOT: workspaceRoot,
			BAPX_ADMIN_GITHUB_USER_IDS: '12345',
			BAPX_GITHUB_APP_ID: '123',
			BAPX_GITHUB_INSTALLATION_ID: '67890',
			BAPX_GITHUB_APP_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }),
			BAPX_TEST_GITHUB_FETCH_LOG: logFile,
		},
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	let stderr = '';
	child.stderr.on('data', (chunk) => { stderr += chunk; });
	t.after(() => {
		if (child.exitCode === null) child.kill('SIGTERM');
		fs.rmSync(workspaceRoot, { recursive: true, force: true });
		fs.rmSync(logFile, { force: true });
	});

	await waitForServer(port, child);
	const before = tree(workspaceRoot);

	const unauthenticated = await request(port, { origin: 'https://admin.bapx.in' });
	assert.equal(unauthenticated.status, 401);
	assert.equal(fs.existsSync(logFile), false, 'authentication must reject before GitHub provider initialization');

	const wrongOrigin = await request(port, { cookie: sessionToken, origin: 'https://evil.example' });
	assert.equal(wrongOrigin.status, 403);
	assert.equal(fs.existsSync(logFile), false, 'origin validation must reject before GitHub provider initialization');

	const resolved = await request(port, { cookie: sessionToken, origin: 'https://admin.bapx.in' });
	assert.equal(resolved.status, 200, stderr);
	assert.deepEqual(resolved.body.repository, {
		owner: 'Canonical-Owner',
		repository: 'Canonical-Repository',
		fullName: 'Canonical-Owner/Canonical-Repository',
		httpsUrl: 'https://github.com/Canonical-Owner/Canonical-Repository.git',
		sshUrl: 'git@github.com:Canonical-Owner/Canonical-Repository.git',
	});
	assert.equal(resolved.body.metadata.fullName, 'Canonical-Owner/Canonical-Repository');
	assert.equal(resolved.body.metadata.visibility, 'private');
	assert.deepEqual(resolved.body.project, {
		slug: 'canonical-owner-canonical-repository',
		path: 'projects/canonical-owner-canonical-repository',
	});
	assert.deepEqual(tree(workspaceRoot), before, 'repository resolution must not mutate Git or filesystem workspace state');

	const calls = fs.readFileSync(logFile, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
	assert.deepEqual(calls.map((call) => call.url), [
		'https://api.github.com/app/installations/67890/access_tokens',
		'https://api.github.com/repos/submitted-owner/submitted-repository',
	]);
});
