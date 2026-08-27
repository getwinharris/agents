import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

const cli = new URL('../dist/bapX.js', import.meta.url);

async function runCli(args, options = {}) {
	const child = spawn(process.execPath, [cli.pathname, ...args], {
		cwd: options.cwd,
		env: { ...process.env, ...options.env },
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	let stdout = '';
	let stderr = '';
	child.stdout.setEncoding('utf8');
	child.stderr.setEncoding('utf8');
	child.stdout.on('data', (chunk) => {
		stdout += chunk;
	});
	child.stderr.on('data', (chunk) => {
		stderr += chunk;
	});
	const [code, signal] = await once(child, 'exit');
	return { code, signal, stdout, stderr };
}

async function withFakeBrowser(callback) {
	const root = await mkdtemp(path.join(tmpdir(), 'bapx-browser-'));
	try {
		const binDir = path.join(root, 'node_modules', '.bin');
		await mkdir(binDir, { recursive: true });
		const logFile = path.join(root, 'browser-calls.jsonl');
		const browser = path.join(binDir, process.platform === 'win32' ? 'agent-browser.cmd' : 'agent-browser');
		const egoBrowser = path.join(binDir, process.platform === 'win32' ? 'ego-browser.cmd' : 'ego-browser');
		await writeFile(
			browser,
			`#!/usr/bin/env node
const fs = require('node:fs');
fs.appendFileSync(process.env.BAPX_BROWSER_CALL_LOG, JSON.stringify({
  argv: process.argv.slice(2),
  session: process.env.AGENT_BROWSER_SESSION,
  namespace: process.env.AGENT_BROWSER_NAMESPACE
}) + '\\n');
`,
		);
		await chmod(browser, 0o755);
		await writeFile(
			egoBrowser,
			`#!/usr/bin/env node
const fs = require('node:fs');
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  fs.appendFileSync(process.env.BAPX_BROWSER_CALL_LOG, JSON.stringify({
    binary: 'ego-browser',
    argv: process.argv.slice(2),
    input,
    session: process.env.BAPX_BROWSER_SESSION,
    namespace: process.env.BAPX_BROWSER_NAMESPACE,
    profileDir: process.env.EGO_BROWSER_PROFILE_DIR
  }) + '\\n');
});
`,
		);
		await chmod(egoBrowser, 0o755);
		await callback(root, logFile);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

describe('bapX browse', () => {
	it('wraps agent-browser with sanitized explicit session and namespace when passing through', async () => {
		await withFakeBrowser(async (root, logFile) => {
			const result = await runCli(
				['browse', '--engine', 'vercel', '--root', root, '--session', 'Admin Smoke!', '--namespace', 'bapX QA', '--', 'get', 'url'],
				{ env: { BAPX_BROWSER_CALL_LOG: logFile } },
			);
			assert.equal(result.code, 0);
			const [call] = (await readFile(logFile, 'utf8')).trim().split('\n').map(JSON.parse);
			assert.deepEqual(call.argv, ['--session', 'admin-smoke', '--namespace', 'bapx-qa', 'get', 'url']);
			assert.equal(call.session, 'admin-smoke');
			assert.equal(call.namespace, 'bapx-qa');
		});
	});

	it('runs the verification sequence inside one isolated browser session', async () => {
		await withFakeBrowser(async (root, logFile) => {
			const result = await runCli(['browse', '--engine', 'vercel', 'verify', 'https://bapx.in/', '--root', root], {
				env: {
					BAPX_BROWSER_CALL_LOG: logFile,
					BAPX_BROWSER_USER: 'owner',
					BAPX_BROWSER_BUSINESS: 'bapx',
					BAPX_BROWSER_PROJECT: 'www',
					BAPX_BROWSER_ACTOR: 'agent',
				},
			});
			assert.equal(result.code, 0);
			assert.match(result.stderr, /browser verified https:\/\/bapx\.in\//);
			const calls = (await readFile(logFile, 'utf8')).trim().split('\n').map(JSON.parse);
			assert.deepEqual(
				calls.map((call) => call.argv.slice(4, 5)[0]),
				['open', 'wait', 'eval', 'errors', 'screenshot', 'snapshot', 'close'],
			);
			assert.ok(calls.every((call) => call.session === calls[0].session));
			assert.ok(calls.every((call) => call.namespace === calls[0].namespace));
		});
	});

	it('uses the AgentBrowser task-space contract by default for verification', async () => {
		await withFakeBrowser(async (root, logFile) => {
			const result = await runCli(
				['browse', 'verify', 'https://platform.bapx.in/', '--root', root, '--session', 'Platform QA!'],
				{ env: { BAPX_BROWSER_CALL_LOG: logFile } },
			);
			assert.equal(result.code, 0);
			assert.match(result.stderr, /engine agentbrowser/);
			const [call] = (await readFile(logFile, 'utf8')).trim().split('\n').map(JSON.parse);
			assert.equal(call.binary, 'ego-browser');
			assert.deepEqual(call.argv, ['nodejs']);
			assert.equal(call.session, 'platform-qa');
			assert.equal(call.profileDir, path.join(root, '.agents', 'browser', 'profiles', call.namespace, 'platform-qa'));
			assert.equal((await stat(call.profileDir)).mode & 0o777, 0o700);
			assert.match(call.input, /taskSpaces\.new\("platform-qa" \+ '-verify-' \+ Date\.now\(\)\)/);
			assert.match(call.input, /browser\.openOrReuseTab\("https:\/\/platform\.bapx\.in\/"/);
			assert.match(call.input, /cdp\('Runtime\.enable'\)/);
			assert.match(call.input, /page\.reload\(/);
			assert.match(call.input, /page\.snapshot\(\)/);
			assert.match(call.input, /page\.screenshot\(/);
			assert.match(call.input, /page\.drainEvents\(\)/);
			assert.match(call.input, /taskSpaces\.complete\(task\.id, \{ keep: false \}\)/);
		});
	});

	it('passes scripts through to AgentBrowser with the scoped environment', async () => {
		await withFakeBrowser(async (root, logFile) => {
			const result = await runCli(
				['browse', '--engine', 'agentbrowser', '--root', root, '--session', 'Agent Work', '--', 'nodejs'],
				{ env: { BAPX_BROWSER_CALL_LOG: logFile } },
			);
			assert.equal(result.code, 0);
			const [call] = (await readFile(logFile, 'utf8')).trim().split('\n').map(JSON.parse);
			assert.equal(call.binary, 'ego-browser');
			assert.deepEqual(call.argv, ['nodejs']);
			assert.equal(call.session, 'agent-work');
			assert.equal(call.profileDir, path.join(root, '.agents', 'browser', 'profiles', call.namespace, 'agent-work'));
		});
	});
});
