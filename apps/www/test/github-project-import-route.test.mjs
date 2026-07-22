import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(testDir, '..');

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

function request(port, payload, { cookie, origin } = {}) {
	const body = JSON.stringify(payload);
	return new Promise((resolve, reject) => {
		const req = http.request({
			host: '127.0.0.1',
			port,
			method: 'POST',
			path: '/api/projects/import',
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
			res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(responseBody) }));
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

function writeGitFixture(binDirectory) {
	fs.mkdirSync(binDirectory, { recursive: true });
	const git = path.join(binDirectory, 'git');
	fs.writeFileSync(git, `#!${process.execPath}\nimport fs from 'node:fs';\nimport path from 'node:path';\nconst args = process.argv.slice(2);\nif (args[0] === 'clone') {\n  const target = args.at(-1);\n  fs.mkdirSync(path.join(target, '.git'), { recursive: true });\n  fs.writeFileSync(path.join(target, 'README.md'), '# HTTP route fixture\\n');\n  process.exit(0);\n}\nif (args.includes('rev-parse')) {\n  process.stdout.write('0123456789abcdef\\n');\n  process.exit(0);\n}\nprocess.stderr.write('unexpected git command');\nprocess.exit(1);\n`, 'utf8');
	fs.chmodSync(git, 0o755);
}

test('imports the browser-shaped canonical payload through the real Admin HTTP route', async (t) => {
	const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bapx-project-import-route-'));
	const binDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'bapx-project-import-git-'));
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
	writeGitFixture(binDirectory);

	const port = await freePort();
	const child = spawn(process.execPath, ['server.mjs'], {
		cwd: appRoot,
		env: {
			...process.env,
			PORT: String(port),
			WORKSPACE_ROOT: workspaceRoot,
			BAPX_ADMIN_GITHUB_USER_IDS: '12345',
			PATH: `${binDirectory}${path.delimiter}${process.env.PATH || ''}`,
		},
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	let stderr = '';
	child.stderr.on('data', (chunk) => { stderr += chunk; });
	t.after(() => {
		if (child.exitCode === null) child.kill('SIGTERM');
		fs.rmSync(workspaceRoot, { recursive: true, force: true });
		fs.rmSync(binDirectory, { recursive: true, force: true });
	});

	await waitForServer(port, child);
	const payload = {
		repositoryUrl: 'https://github.com/Canonical-Owner/Canonical-Repository.git',
		projectSlug: 'edited-admin-destination',
		confirmed: true,
	};

	const unauthenticated = await request(port, payload, { origin: 'https://admin.bapx.in' });
	assert.equal(unauthenticated.status, 401);
	assert.equal(fs.existsSync(path.join(workspaceRoot, 'projects')), false);

	const wrongOrigin = await request(port, payload, { cookie: sessionToken, origin: 'https://evil.example' });
	assert.equal(wrongOrigin.status, 403);
	assert.equal(fs.existsSync(path.join(workspaceRoot, 'projects')), false);

	const imported = await request(port, payload, { cookie: sessionToken, origin: 'https://admin.bapx.in' });
	assert.equal(imported.status, 201, stderr);
	assert.equal(imported.body.project.slug, 'edited-admin-destination');
	assert.equal(imported.body.project.path, 'projects/edited-admin-destination');
	assert.equal(imported.body.project.repository.fullName, 'Canonical-Owner/Canonical-Repository');
	assert.equal(imported.body.project.repository.httpsUrl, payload.repositoryUrl);
	assert.equal(imported.body.project.commitSha, '0123456789abcdef');
	assert.equal(imported.body.project.status, 'completed');

	const destination = path.join(workspaceRoot, imported.body.project.path);
	assert.equal(fs.readFileSync(path.join(destination, 'README.md'), 'utf8'), '# HTTP route fixture\n');
	const metadata = JSON.parse(fs.readFileSync(path.join(destination, '.bapx-project.json'), 'utf8'));
	assert.equal(metadata.repository.fullName, 'Canonical-Owner/Canonical-Repository');
	assert.equal(metadata.repository.httpsUrl, payload.repositoryUrl);
	assert.equal(metadata.commitSha, imported.body.project.commitSha);
});
