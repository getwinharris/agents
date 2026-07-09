import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { describe, it } from 'node:test';

const cli = new URL('../dist/bapX.js', import.meta.url);

async function runCli(args) {
	const child = spawn(process.execPath, [cli.pathname, ...args], {
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

describe('bapX (argument parsing)', () => {
	it('treats the positional as the resource when flags precede it in `bapX run`', async () => {
		const result = await runCli(['run', '--target', 'cloudflare', 'hello']);
		assert.equal(result.code, 1);
		assert.ok(result.stderr.includes('Resource "hello" not found'), result.stderr);
		assert.ok(!result.stderr.includes('Unknown flag'), result.stderr);
	});

	it('reports the missing resource when `bapX run` receives flags but no positional', async () => {
		const result = await runCli(['run', '--target', 'node']);
		assert.equal(result.code, 1);
		assert.ok(result.stderr.includes('Missing agent or workflow name'), result.stderr);
	});

	it('treats `--target=node` the same as `--target node`', async () => {
		const result = await runCli(['run', '--target=node']);
		assert.equal(result.code, 1);
		assert.ok(result.stderr.includes('Missing agent or workflow name'), result.stderr);
		assert.ok(!result.stderr.includes('Unknown flag'), result.stderr);
	});

	it('reports a missing string value when the next argument is another flag', async () => {
		const result = await runCli(['run', 'hello', '--target', '--root', './app']);
		assert.equal(result.code, 1);
		assert.ok(result.stderr.includes('Missing value for --target'), result.stderr);
	});

	it('reports a missing string value when the next argument is an inline flag', async () => {
		const result = await runCli(['run', 'hello', '--target', '--root=./app']);
		assert.equal(result.code, 1);
		assert.ok(result.stderr.includes('Missing value for --target'), result.stderr);
	});

	it('accepts a flag-like string value when provided inline', async () => {
		const result = await runCli(['run', 'hello', '--target=--root']);
		assert.equal(result.code, 1);
		assert.ok(result.stderr.includes('Invalid target: "--root"'), result.stderr);
		assert.ok(!result.stderr.includes('Missing value for --target'), result.stderr);
	});

	it('rejects --input when passed to `bapX build`', async () => {
		const result = await runCli(['build', '--input', '{"x":1}']);
		assert.equal(result.code, 1);
		assert.ok(result.stderr.includes('`bapX build` does not accept --input'), result.stderr);
	});

	it('rejects --port when passed to `bapX build`', async () => {
		const result = await runCli(['build', '--port', '8080']);
		assert.equal(result.code, 1);
		assert.ok(result.stderr.includes('`bapX build` does not accept --port'), result.stderr);
	});

	it('rejects --input when passed to `bapX dev`', async () => {
		const result = await runCli(['dev', '--input', '{}']);
		assert.equal(result.code, 1);
		assert.ok(result.stderr.includes('`bapX dev` does not accept --input'), result.stderr);
	});

	it('accepts the workflow --id flag for resource-aware validation', async () => {
		const result = await runCli(['run', 'workflow:hello', '--id', 'chosen-run', '--target', 'node']);
		assert.equal(result.code, 1);
		assert.ok(result.stderr.includes('Resource "workflow:hello" not found'), result.stderr);
		assert.ok(!result.stderr.includes('Unknown flag'), result.stderr);
	});

	it('attaches to an absolute server without requiring local project configuration', async () => {
		const result = await runCli([
			'run',
			'workflow:report',
			'--server',
			'http://127.0.0.1:1/api/bapX',
		]);
		assert.equal(result.code, 1);
		assert.ok(!result.stderr.includes('Missing required `target`'), result.stderr);
		assert.ok(result.stderr.includes('Workflow failed'), result.stderr);
	});

	it('rejects malformed header syntax before starting work', async () => {
		const result = await runCli(['run', 'hello', '--header', 'invalid']);
		assert.equal(result.code, 1);
		assert.ok(result.stderr.includes('Invalid header'), result.stderr);
	});

	it('rejects the removed --payload flag when passed to `bapX run`', async () => {
		const result = await runCli(['run', 'hello', '--payload', '{}']);
		assert.equal(result.code, 1);
		assert.ok(result.stderr.includes('Unknown flag for `bapX run`: --payload'), result.stderr);
	});

	it('rejects an unknown flag when passed to `bapX run`', async () => {
		const result = await runCli(['run', 'hello', '--bogus']);
		assert.equal(result.code, 1);
		assert.ok(result.stderr.includes('Unknown flag for `bapX run`: --bogus'), result.stderr);
	});
});
