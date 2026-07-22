import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
// The config resolver is internal to the CLI (the public `@bapX/cli/config`
// subpath exposes only the `bapX.config.ts` authoring API), so test it at the
// source boundary the CLI consumes.
import { resolveConfig } from '../src/lib/config.ts';
import { sanitizedChildEnv } from './child-env.mjs';

// Strip model-provider credentials (ANTHROPIC_API_KEY, ...) from spawned CLI
// children so runs that reach model invocation fail with "No API key for
// provider" regardless of what the developer's shell exports.
const childEnv = sanitizedChildEnv();

const cli = new URL('../dist/bapX.js', import.meta.url);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const fixtureRoots = [];

process.on('exit', () => {
	for (const root of fixtureRoots) fs.rmSync(root, { recursive: true, force: true });
});

describe('resolveConfig()', () => {
	describe('source-layout selection', () => {
		it('resolves sourceRoot to the project root when no agent-compatible source root or src/ exists', async () => {
			const root = createFixtureRoot();
			const { bapXConfig } = await resolveConfig({ cwd: root, inline: { target: 'node' } });
			assert.equal(bapXConfig.root, root);
			assert.equal(bapXConfig.sourceRoot, root);
		});

		it('resolves sourceRoot to src/ when src/ exists and no agent-compatible source root exists', async () => {
			const root = createFixtureRoot();
			fs.mkdirSync(path.join(root, 'src'));
			fs.mkdirSync(path.join(root, 'workflows'));
			const { bapXConfig } = await resolveConfig({ cwd: root, inline: { target: 'node' } });
			assert.equal(bapXConfig.sourceRoot, path.join(root, 'src'));
		});

		it('resolves sourceRoot to .agents/ when .agents/ exists alongside provider dirs, src/, and bare dirs', async () => {
			const root = createFixtureRoot();
			fs.mkdirSync(path.join(root, '.agents'));
			fs.mkdirSync(path.join(root, '.claude'));
			fs.mkdirSync(path.join(root, '.github'));
			fs.mkdirSync(path.join(root, 'src'));
			fs.mkdirSync(path.join(root, 'agents'));
			fs.mkdirSync(path.join(root, 'workflows'));
			const { bapXConfig } = await resolveConfig({ cwd: root, inline: { target: 'node' } });
			assert.equal(bapXConfig.sourceRoot, path.join(root, '.agents'));
		});

		it('resolves sourceRoot to .claude/ when .agents/ is absent', async () => {
			const root = createFixtureRoot();
			fs.mkdirSync(path.join(root, '.claude'));
			fs.mkdirSync(path.join(root, '.github'));
			fs.mkdirSync(path.join(root, 'src'));
			const { bapXConfig } = await resolveConfig({ cwd: root, inline: { target: 'node' } });
			assert.equal(bapXConfig.sourceRoot, path.join(root, '.claude'));
		});

		it('resolves sourceRoot to .github/ when .agents/ and .claude/ are absent', async () => {
			const root = createFixtureRoot();
			fs.mkdirSync(path.join(root, '.github'));
			fs.mkdirSync(path.join(root, 'src'));
			const { bapXConfig } = await resolveConfig({ cwd: root, inline: { target: 'node' } });
			assert.equal(bapXConfig.sourceRoot, path.join(root, '.github'));
		});
	});

	describe('validation', () => {
		it('rejects when no target is supplied inline or in a config file', async () => {
			const root = createFixtureRoot();
			await assert.rejects(resolveConfig({ cwd: root }), /Missing required `target`/);
		});

		it('rejects a config file with an unknown field', async () => {
			const root = createFixtureRoot();
			fs.writeFileSync(
				path.join(root, 'bapX.config.mjs'),
				`export default { target: 'node', bogus: true };\n`,
			);
			await assert.rejects(resolveConfig({ cwd: root }), /Invalid config/);
		});

		it('rejects a config file with an invalid target value', async () => {
			const root = createFixtureRoot();
			fs.writeFileSync(path.join(root, 'bapX.config.mjs'), `export default { target: 'deno' };\n`);
			await assert.rejects(resolveConfig({ cwd: root }), /Invalid config/);
		});

		it('loads a named Vite config export', async () => {
			const root = createFixtureRoot();
			fs.writeFileSync(
				path.join(root, 'bapX.config.mjs'),
				`export default { target: 'node' };\nexport const vite = { server: { watch: { ignored: ['**/evals/results/**'] } } };\n`,
			);

			const { viteConfig } = await resolveConfig({ cwd: root });

			assert.deepEqual(viteConfig.server?.watch?.ignored, ['**/evals/results/**']);
		});

		it('rejects an empty output path', async () => {
			const root = createFixtureRoot();
			await assert.rejects(
				resolveConfig({ cwd: root, inline: { target: 'node', output: '' } }),
				/Path must not be empty/,
			);
		});

		it('rejects when output resolves to the project root', async () => {
			const root = createFixtureRoot();
			await assert.rejects(
				resolveConfig({ cwd: root, inline: { target: 'node', output: root } }),
				/`output` resolves to the project root/,
			);
		});

		it('rejects a config file whose default export is not an object', async () => {
			const root = createFixtureRoot();
			fs.writeFileSync(path.join(root, 'bapX.config.mjs'), `export default 'node';\n`);
			await assert.rejects(
				resolveConfig({ cwd: root }),
				/must export a config object as the default export/,
			);
		});
	});
});

describe('bapX run', () => {
	it('accepts omitted --input for a no-input Workflow Definition', async () => {
		const root = createNoInputWorkflowFixture();
		const child = spawn(process.execPath, [cli.pathname, 'run', 'no-input'], {
			cwd: root,
			env: childEnv,
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		let stderr = '';
		child.stderr.setEncoding('utf8');
		child.stderr.on('data', (chunk) => {
			stderr += chunk;
		});
		const [exitCode] = await once(child, 'exit');

		assert.equal(exitCode, 0, stderr);
	});

	it('rejects explicit --input for a no-input Workflow Definition', async () => {
		const root = createNoInputWorkflowFixture();
		const child = spawn(process.execPath, [cli.pathname, 'run', 'no-input', '--input', '{}'], {
			cwd: root,
			env: childEnv,
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		let stderr = '';
		child.stderr.setEncoding('utf8');
		child.stderr.on('data', (chunk) => {
			stderr += chunk;
		});
		const [exitCode] = await once(child, 'exit');

		assert.equal(exitCode, 1);
		assert.match(stderr, /does not accept input/);
	});

	it('delivers --input JSON unchanged through the generated workflow runner', async () => {
		const root = createWorkflowFixture();
		const child = spawn(
			process.execPath,
			[cli.pathname, 'run', 'inspect-input', '--input', '{"value":"weekly","nested":{"count":3}}'],
			{ cwd: root, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] },
		);
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
		const [exitCode] = await once(child, 'exit');

		assert.equal(exitCode, 0, stderr);
		assert.deepEqual(JSON.parse(stdout), { value: 'weekly', nested: { count: 3 } });
		assert.match(stderr, /authored module log/);
		assert.match(stderr, /authored workflow log/);
	});

	it('runs a route-free agent over HTTP and prints its generated instance ID', async () => {
		const root = createFixtureRoot();
		linkRuntime(root);
		fs.writeFileSync(path.join(root, 'bapX.config.mjs'), `export default { target: 'node' };\n`);
		fs.mkdirSync(path.join(root, 'agents'));
		fs.writeFileSync(
			path.join(root, 'agents', 'assistant.mjs'),
			`import { defineAgent } from '@bapX/runtime';\n` +
				`export default defineAgent(() => ({ model: 'anthropic/claude-haiku-4-5' }));\n`,
		);
		const child = spawn(
			process.execPath,
			[cli.pathname, 'run', 'assistant', '--input', '{"message":"hello"}'],
			{ cwd: root, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] },
		);
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
		const [exitCode] = await once(child, 'exit');

		assert.equal(exitCode, 1);
		assert.match(stderr, /id\s+[0-9A-HJKMNP-TV-Z]{26}/);
		// The agent runs past config and fails at model invocation (no API key in
		// the test environment), confirming the route-free HTTP run reached the model.
		assert.match(stderr, /No API key for provider/);
		assert.equal(stdout, '');
	});

	it('runs a Node fixture with a project dependency without writing runtime artifacts', async () => {
		const root = createWorkflowFixture();
		const temporaryEntriesBefore = new Set(
			fs.readdirSync(os.tmpdir()).filter((entry) => entry.startsWith('bapX-run-')),
		);
		const child = spawn(
			process.execPath,
			[
				cli.pathname,
				'run',
				'inspect-input',
				'--input',
				'{"value":"diskless","nested":{"count":1}}',
			],
			{ cwd: root, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] },
		);
		let stderr = '';
		child.stderr.setEncoding('utf8');
		child.stderr.on('data', (chunk) => {
			stderr += chunk;
		});
		const [exitCode] = await once(child, 'exit');
		const temporaryEntriesAfter = fs
			.readdirSync(os.tmpdir())
			.filter((entry) => entry.startsWith('bapX-run-'));

		assert.equal(exitCode, 0, stderr);
		assert.equal(fs.existsSync(path.join(root, 'dist')), false);
		assert.equal(fs.existsSync(path.join(root, '.bapX-vite')), false);
		assert.equal(fs.existsSync(path.join(root, 'node_modules', '.vite')), false);
		assert.deepEqual(
			temporaryEntriesAfter.filter((entry) => !temporaryEntriesBefore.has(entry)),
			[],
		);
	});

	it('represents omitted CLI input as undefined for a workflow with schema defaults', async () => {
		const root = createWorkflowFixture(true);
		const child = spawn(process.execPath, [cli.pathname, 'run', 'inspect-input'], {
			cwd: root,
			env: childEnv,
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
		const [exitCode] = await once(child, 'exit');

		assert.equal(exitCode, 0, stderr);
		assert.deepEqual(JSON.parse(stdout), { value: 'default' });
	});
});

describe('bapX build', () => {
	it('rejects a project that contains channels but no agents or workflows', async () => {
		const root = createFixtureRoot();
		fs.writeFileSync(path.join(root, 'bapX.config.mjs'), `export default { target: 'node' };\n`);
		fs.mkdirSync(path.join(root, 'channels'));
		fs.writeFileSync(
			path.join(root, 'channels', 'custom.mjs'),
			`export const channel = { routes: [{ method: 'POST', path: '/webhook', handler: () => new Response() }] };\n`,
		);

		const child = spawn(process.execPath, [cli.pathname, 'build'], {
			cwd: root,
			env: childEnv,
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		let output = '';
		for (const stream of [child.stdout, child.stderr]) {
			stream.setEncoding('utf8');
			stream.on('data', (chunk) => {
				output += chunk;
			});
		}
		const [exitCode] = await once(child, 'exit');

		assert.equal(exitCode, 1);
		assert.match(output, /No agent or workflow files found/);
		assert.equal(fs.existsSync(path.join(root, 'dist', 'server.mjs')), false);
	});

	it('discovers agents and workflows from .agents/ and ignores provider, src, and bare layouts when .agents/ exists', async () => {
		const root = createFixtureRoot();
		linkRuntime(root);
		fs.writeFileSync(path.join(root, 'bapX.config.mjs'), `export default { target: 'node' };\n`);

		fs.mkdirSync(path.join(root, '.agents', 'agents'), { recursive: true });
		fs.mkdirSync(path.join(root, '.agents', 'workflows'), { recursive: true });
		fs.writeFileSync(
			path.join(root, '.agents', 'agents', 'helper.mjs'),
			`import { defineAgent, defineAgentProfile } from '@bapX/runtime';\n` +
				`const profile = defineAgentProfile({ instructions: 'helper' });\n` +
				`export default defineAgent(() => ({ profile }));\n`,
		);
		fs.writeFileSync(
			path.join(root, '.agents', 'workflows', 'inner.mjs'),
			`import { defineAgent, defineWorkflow } from '@bapX/runtime';\n` +
				`const agent = defineAgent(() => ({ model: 'anthropic/claude-haiku-4-5' }));\n` +
				`export default defineWorkflow({ agent, async run() { return { ok: true }; } });\n`,
		);

		// Other layouts that must be ignored because .agents/ exists.
		fs.mkdirSync(path.join(root, '.claude', 'agents'), { recursive: true });
		fs.writeFileSync(
			path.join(root, '.claude', 'agents', 'claude-stray.mjs'),
			`import { defineAgent, defineAgentProfile } from '@bapX/runtime';\n` +
				`const profile = defineAgentProfile({ instructions: 'claude stray' });\n` +
				`export default defineAgent(() => ({ profile }));\n`,
		);
		fs.mkdirSync(path.join(root, 'src', 'workflows'), { recursive: true });
		fs.writeFileSync(
			path.join(root, 'src', 'workflows', 'src-stray.mjs'),
			`import { defineAgent, defineWorkflow } from '@bapX/runtime';\n` +
				`const agent = defineAgent(() => ({ model: 'anthropic/claude-haiku-4-5' }));\n` +
				`export default defineWorkflow({ agent, async run() { return { ok: true }; } });\n`,
		);
		fs.mkdirSync(path.join(root, 'agents'));
		fs.mkdirSync(path.join(root, 'workflows'));
		fs.writeFileSync(
			path.join(root, 'agents', 'stray.mjs'),
			`import { defineAgent, defineAgentProfile } from '@bapX/runtime';\n` +
				`const profile = defineAgentProfile({ instructions: 'stray' });\n` +
				`export default defineAgent(() => ({ profile }));\n`,
		);
		fs.writeFileSync(
			path.join(root, 'workflows', 'outer.mjs'),
			`import { defineAgent, defineWorkflow } from '@bapX/runtime';\n` +
				`const agent = defineAgent(() => ({ model: 'anthropic/claude-haiku-4-5' }));\n` +
				`export default defineWorkflow({ agent, async run() { return { ok: true }; } });\n`,
		);

		const child = spawn(process.execPath, [cli.pathname, 'build'], {
			cwd: root,
			env: childEnv,
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		let output = '';
		for (const stream of [child.stdout, child.stderr]) {
			stream.setEncoding('utf8');
			stream.on('data', (chunk) => {
				output += chunk;
			});
		}
		const [exitCode] = await once(child, 'exit');

		assert.equal(exitCode, 0, `bapX build failed:\n\n${output}`);
		assert.match(output, /source\s+\.agents/);
		assert.match(output, /agents\s+helper/s);
		assert.match(output, /workflows\s+inner/s);
		assert.doesNotMatch(output, /claude-stray/);
		assert.doesNotMatch(output, /src-stray/);
		assert.doesNotMatch(output, /stray/);
		assert.doesNotMatch(output, /outer/);
		assert.equal(fs.existsSync(path.join(root, 'dist', 'server.mjs')), true);
	});
});

function createFixtureRoot() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bapX-cli-config-'));
	fixtureRoots.push(root);
	return root;
}

function createNoInputWorkflowFixture() {
	const root = createFixtureRoot();
	linkRuntime(root);
	fs.writeFileSync(path.join(root, 'bapX.config.mjs'), `export default { target: 'node' };\n`);
	fs.mkdirSync(path.join(root, 'workflows'));
	fs.writeFileSync(
		path.join(root, 'workflows', 'no-input.mjs'),
		`import { defineAgent, defineWorkflow } from '@bapX/runtime';\n` +
			`const agent = defineAgent(() => ({ model: 'anthropic/claude-haiku-4-5' }));\n` +
			`export default defineWorkflow({ agent, async run() { return { ok: true }; } });\n`,
	);
	return root;
}

function createWorkflowFixture(optionalInput = false) {
	const root = createFixtureRoot();
	linkRuntime(root);
	fs.writeFileSync(path.join(root, 'bapX.config.mjs'), `export default { target: 'node' };\n`);
	fs.mkdirSync(path.join(root, 'workflows'));
	fs.writeFileSync(
		path.join(root, 'workflows', 'inspect-input.mjs'),
		`import * as v from 'valibot';\n` +
			`import { defineAgent, defineWorkflow } from '@bapX/runtime';\n` +
			`console.log('authored module log');\n` +
			`const agent = defineAgent(() => ({ model: 'anthropic/claude-haiku-4-5' }));\n` +
			`export default defineWorkflow({\n` +
			`  agent,\n` +
			(optionalInput
				? `  input: v.object({ value: v.optional(v.string(), 'default') }),\n  async run({ input }) { return input; },\n`
				: `  input: v.object({ value: v.string(), nested: v.object({ count: v.number() }) }),\n  async run({ input }) { console.log('authored workflow log'); return input; },\n`) +
			`});\n`,
	);
	const valibotPath = path.join(repositoryRoot, 'node_modules', 'valibot');
	fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });
	fs.symlinkSync(valibotPath, path.join(root, 'node_modules', 'valibot'), 'dir');
	return root;
}

function linkRuntime(root) {
	const scope = path.join(root, 'node_modules', '@bapX');
	fs.mkdirSync(scope, { recursive: true });
	fs.symlinkSync(
		path.join(repositoryRoot, 'packages', 'runtime'),
		path.join(scope, 'runtime'),
		'dir',
	);
}
