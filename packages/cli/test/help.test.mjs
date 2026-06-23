import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const cli = new URL('../dist/flue.js', import.meta.url);

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

describe('flue (top-level flags)', () => {
	it('prints usage to stdout and exits 0 when invoked with --help, -h, or help', async () => {
		for (const arg of ['--help', '-h', 'help']) {
			const result = await runCli([arg]);
			assert.equal(result.code, 0, `\`flue ${arg}\` should exit 0`);
			assert.ok(result.stdout.includes('Usage:'), `\`flue ${arg}\` should print usage to stdout`);
			assert.equal(result.stderr, '');
		}
	});

	it('documents positional blueprint commands without the removed category flag', async () => {
		const result = await runCli(['--help']);
		assert.equal(result.code, 0);
		assert.ok(result.stdout.includes('flue add   [<kind> <name|url>] [--print]'));
		assert.ok(result.stdout.includes('flue update <kind> <name|url> [--print]'));
		assert.ok(result.stdout.includes('update Fetch an updated blueprint implementation guide'));
		assert.ok(!result.stdout.includes('--category'));
	});

	it('prints the package version to stdout and exits 0 when invoked with --version or -v', async () => {
		const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
		for (const arg of ['--version', '-v']) {
			const result = await runCli([arg]);
			assert.equal(result.code, 0, `\`flue ${arg}\` should exit 0`);
			assert.equal(result.stdout.trim(), pkg.version);
			assert.equal(result.stderr, '');
		}
	});

	it('prints usage to stderr and exits 1 when the command is unknown', async () => {
		const result = await runCli(['frobnicate']);
		assert.equal(result.code, 1);
		assert.equal(result.stdout, '');
		assert.ok(result.stderr.includes('Usage:'));
	});
});
