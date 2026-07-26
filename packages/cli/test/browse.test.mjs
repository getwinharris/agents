import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
		await callback(root, logFile);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

describe('bapX browse', () => {
	it('wraps agent-browser with sanitized explicit session and namespace when passing through', async () => {
		await withFakeBrowser(async (root, logFile) => {
			const result = await runCli(
				['browse', '--root', root, '--session', 'Admin Smoke!', '--namespace', 'bapX QA', '--', 'get', 'url'],
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
			const result = await runCli(['browse', 'verify', 'https://bapx.in/', '--root', root], {
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
});
