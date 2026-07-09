import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import { createServer } from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const cli = new URL('../dist/flue.js', import.meta.url);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const fixtureRoots = [];

process.on('exit', () => {
	for (const root of fixtureRoots) fs.rmSync(root, { recursive: true, force: true });
});

test('restarts after discovered config changes and recovers after invalid config', async () => {
	const root = createFixtureRoot();
	const port = await getAvailablePort();
	writeWorkflow(root);
	fs.writeFileSync(
		path.join(root, 'workflows', 'daily.report.mjs'),
		`import { defineAgent, defineWorkflow } from '@bapX/runtime';\nexport default defineWorkflow({ agent: defineAgent(() => ({ model: 'anthropic/claude-haiku-4-5' })), async run() { return { ok: true }; } });\n`,
	);
	fs.writeFileSync(
		path.join(root, 'workflows', 'weekly.mjs'),
		`import { defineAgent, defineWorkflow } from '@bapX/runtime';\nexport default defineWorkflow({ agent: defineAgent(() => ({ model: 'anthropic/claude-haiku-4-5' })), async run() { return { ok: true }; } });\n`,
	);
	fs.mkdirSync(path.join(root, 'agents'));
	for (const name of ['support', 'researcher', 'reviewer', 'writer', 'planner']) {
		fs.writeFileSync(
			path.join(root, 'agents', `${name}.mjs`),
			`import { defineAgent } from '@bapX/runtime';\nexport default defineAgent(() => ({ model: 'anthropic/claude-haiku-4-5' }));\n`,
		);
	}
	fs.mkdirSync(path.join(root, 'channels'));
	for (const name of ['slack', 'teams', 'webhook']) {
		fs.writeFileSync(
			path.join(root, 'channels', `${name}.mjs`),
			`export const channel = { routes: [{ method: 'POST', path: '/events', handler: () => new Response() }] };\n`,
		);
	}
	fs.writeFileSync(path.join(root, '.config-helper.mjs'), `export default 'dist-one';\n`);
	fs.writeFileSync(
		path.join(root, 'flue.config.mjs'),
		`import output from './.config-helper.mjs';\nexport default { target: 'node', output };\n`,
	);

	const dev = startDev(root, ['--port', String(port)]);
	try {
		await waitForServer(port, dev.logs);
		await dev.waitForLog(`http://localhost:${port}`);
		assert.match(dev.logs(), /flue v\S+\s+ready in \d+ ms/);
		assert.match(dev.logs(), /Agents:\s+planner, researcher, \+3 others/);
		assert.match(dev.logs(), /Workflows:\s+daily\.report, smoke, \+1 other/);
		assert.match(dev.logs(), /Channels:\s+slack, teams, \+1 other/);
		assert.match(dev.logs(), /\d{2}:\d{2}:\d{2} watching for file changes\.\.\./);
		assert.doesNotMatch(dev.logs(), /flue connect|➜/);
		assert.equal(fs.existsSync(path.join(root, 'dist-one', 'server.mjs')), false);

		fs.writeFileSync(
			path.join(root, 'agents', 'support.mjs'),
			`import { defineAgent } from '@bapX/runtime';\nexport default defineAgent(() => ({ model: 'anthropic/claude-haiku-4-5' }));\n`,
		);
		await dev.waitForLog('changed agents/support.mjs');
		await dev.waitForLog('reloaded in');
		assert.match(dev.logs(), /\d{2}:\d{2}:\d{2} changed agents\/support\.mjs/);
		assert.match(dev.logs(), /\d{2}:\d{2}:\d{2} reloaded in \d+ms/);

		fs.writeFileSync(path.join(root, '.config-helper.mjs'), `export default 'dist-two';\n`);
		fs.appendFileSync(path.join(root, 'flue.config.mjs'), '\n');
		await dev.waitForLog(`http://localhost:${port}`, 2);
		await waitForServer(port);

		fs.writeFileSync(path.join(root, 'bapX.config.ts'), `export default { target: ;\n`);
		await dev.waitForLog('Dev server restart failed. Waiting for a configuration change...');
		await waitForServerDown(port);

		fs.writeFileSync(
			path.join(root, 'bapX.config.ts'),
			`export default { target: 'node', output: 'dist-ts' };\n`,
		);
		await dev.waitForLog(`http://localhost:${port}`, 3);
		await waitForServer(port);

		fs.rmSync(path.join(root, 'bapX.config.ts'));
		await dev.waitForLog('bapX.config.ts changed; restarting');
		await dev.waitForLog(`http://localhost:${port}`, 2);
		await waitForServer(port);
	} finally {
		await dev.stop();
	}
});

test('ignores paths configured through the Vite watcher', async () => {
	const root = createFixtureRoot();
	const port = await getAvailablePort();
	writeWorkflow(root);
	fs.writeFileSync(
		path.join(root, 'flue.config.mjs'),
		`export default { target: 'node' };\nexport const vite = { server: { watch: { ignored: ['**/evals/results/**'] } } };\n`,
	);
	fs.mkdirSync(path.join(root, 'evals', 'results'), { recursive: true });

	const dev = startDev(root, ['--port', String(port)]);
	try {
		await waitForServer(port, dev.logs);
		fs.writeFileSync(path.join(root, 'evals', 'results', 'output.json'), '{}');
		await new Promise((resolve) => setTimeout(resolve, 300));
		assert.doesNotMatch(dev.logs(), /changed evals\/results\/output\.json/);

		fs.appendFileSync(path.join(root, 'workflows', 'smoke.mjs'), '\n');
		await dev.waitForLog('changed workflows/smoke.mjs');
		await dev.waitForLog('reloaded in');
	} finally {
		await dev.stop();
	}
});

test('keeps the listener alive and recovers after an invalid source reload', async () => {
	const root = createFixtureRoot();
	const port = await getAvailablePort();
	writeWorkflow(root);

	const dev = startDev(root, ['--target', 'node', '--port', String(port)]);
	try {
		await waitForServer(port, dev.logs);
		fs.writeFileSync(path.join(root, 'workflows', 'smoke.mjs'), `export default { broken: ;\n`);
		await dev.waitForLog('Rebuild failed:');
		await waitForUnavailable(port, 'failed');

		writeWorkflow(root, true);
		await dev.waitForLog('reloaded in');
		await waitForServer(port, dev.logs);
	} finally {
		await dev.stop();
	}
});

test('prints namespaced diagnostics when DEBUG enables dev logging', async () => {
	const root = createFixtureRoot();
	const port = await getAvailablePort();
	writeWorkflow(root);

	const dev = startDev(root, ['--target', 'node', '--port', String(port)], {
		DEBUG: 'flue:dev*',
	});
	try {
		await waitForServer(port, dev.logs);
		await dev.waitForLog('flue:dev:server node server ready');
		assert.match(dev.logs(), /flue:dev starting target=node/);
	} finally {
		await dev.stop();
	}
});

test('uses the next available Node port when the default port is occupied', async () => {
	const root = createFixtureRoot();
	writeWorkflow(root);
	const blocker = createServer();
	const blockedDefault = await new Promise((resolve) => {
		blocker.once('error', () => resolve(false));
		blocker.listen(3583, () => resolve(true));
	});

	const dev = startDev(root, ['--target', 'node']);
	try {
		const selectedPort = await waitForSelectedPort(dev.logs);
		assert.notEqual(selectedPort, 3583);
		await waitForServer(selectedPort, dev.logs);
	} finally {
		await dev.stop();
		if (blockedDefault) {
			blocker.close();
			await once(blocker, 'close');
		}
	}
});

test('does not report ready when an explicit requested port is occupied', async () => {
	const root = createFixtureRoot();
	const port = await getAvailablePort();
	writeWorkflow(root);
	const blocker = createServer();
	blocker.listen(port);
	await once(blocker, 'listening');

	const dev = startDev(root, ['--target', 'node', '--port', String(port)]);
	try {
		await dev.waitForLog('Dev server failed:');
		assert.doesNotMatch(dev.logs(), /flue v\S+\s+ready in|Agents:|Workflows:/);
	} finally {
		await dev.stop();
		blocker.close();
		await once(blocker, 'close');
	}
});

test('resolves attributed Markdown imports from workspace package exports', async () => {
	const root = createFixtureRoot();
	const port = await getAvailablePort();
	const packageRoot = path.join(root, 'packages', 'workspace-content');
	fs.mkdirSync(path.join(packageRoot, 'explore'), { recursive: true });
	fs.writeFileSync(
		path.join(packageRoot, 'package.json'),
		JSON.stringify({
			name: '@repo/workspace-content',
			type: 'module',
			exports: {
				'./explore/SKILL.md': './explore/SKILL.md',
				'./guide.md': './guide.md',
			},
		}),
	);
	fs.writeFileSync(
		path.join(packageRoot, 'explore', 'SKILL.md'),
		'---\nname: explore\ndescription: Explore a repository.\n---\nExplore carefully.\n',
	);
	fs.writeFileSync(path.join(packageRoot, 'guide.md'), '# Workspace guide\n');
	const packageLink = path.join(root, 'node_modules', '@repo', 'workspace-content');
	fs.mkdirSync(path.dirname(packageLink), { recursive: true });
	fs.symlinkSync(packageRoot, packageLink, 'dir');
	fs.mkdirSync(path.join(root, 'workflows'));
	fs.writeFileSync(
		path.join(root, 'workflows', 'workspace-imports.mjs'),
		`import { defineAgent, defineWorkflow } from '@bapX/runtime';
import explore from '@repo/workspace-content/explore/SKILL.md' with { type: 'skill' };
import guide from '@repo/workspace-content/guide.md' with { type: 'markdown' };
export const route = async (_c, next) => next();
export default defineWorkflow({ agent: defineAgent(() => ({ model: 'anthropic/claude-haiku-4-5', skills: [explore] })), async run() { return { skill: explore.name, guide }; } });
`,
	);

	const dev = startDev(root, ['--target', 'node', '--port', String(port)]);
	try {
		await waitForServer(port, dev.logs, 'workspace-imports', {
			skill: 'explore',
			guide: '# Workspace guide\n',
		});
	} finally {
		await dev.stop();
	}
});

test('reloads the Node application when an external environment file changes', async () => {
	const root = createFixtureRoot();
	const envRoot = createFixtureRoot();
	const envPath = path.join(envRoot, '.env');
	const port = await getAvailablePort();
	fs.mkdirSync(path.join(root, 'workflows'));
	fs.writeFileSync(
		path.join(root, 'workflows', 'environment.mjs'),
		`import { defineAgent, defineWorkflow } from '@bapX/runtime';\nexport const route = async (_c, next) => next();\nexport default defineWorkflow({ agent: defineAgent(() => ({ model: 'anthropic/claude-haiku-4-5' })), async run() { return { value: process.env.FLUE_DEV_ENV_TEST }; } });\n`,
	);
	fs.writeFileSync(envPath, 'FLUE_DEV_ENV_TEST=first\n');

	const dev = startDev(root, ['--target', 'node', '--env', envPath, '--port', String(port)]);
	try {
		await waitForServer(port, dev.logs, 'environment', { value: 'first' });
		fs.writeFileSync(envPath, 'FLUE_DEV_ENV_TEST=second\n');
		await dev.waitForLog(`${envPath} changed; restarting`);
		await dev.waitForLog(`http://localhost:${port}`, 2);
		await waitForServer(port, dev.logs, 'environment', { value: 'second' });
	} finally {
		await dev.stop();
	}
});

test('polls an explicit config when its directory cannot be watched', async () => {
	const root = createFixtureRoot();
	const configRoot = createFixtureRoot();
	const configPath = path.join(configRoot, 'external.config.mjs');
	const preloadPath = path.join(root, 'reject-config-directory-watch.cjs');
	const port = await getAvailablePort();
	writeWorkflow(root);
	fs.writeFileSync(
		configPath,
		`export default { target: 'node', root: ${JSON.stringify(root)}, output: ${JSON.stringify(path.join(root, 'dist-one'))} };\n`,
	);
	fs.writeFileSync(
		preloadPath,
		`const fs = require('node:fs');
const originalWatch = fs.watch;
fs.watch = function watch(target, ...args) {
	if (String(target) === ${JSON.stringify(configRoot)}) {
		const error = new Error('too many open files, watch');
		error.code = 'EMFILE';
		throw error;
	}
	return originalWatch.call(this, target, ...args);
};
`,
	);

	const dev = startDev(root, ['--config', configPath, '--port', String(port)], {
		NODE_OPTIONS: `--require=${preloadPath}`,
	});
	try {
		await waitForServer(port, dev.logs);
		fs.writeFileSync(
			configPath,
			`export default { target: 'node', root: ${JSON.stringify(root)}, output: ${JSON.stringify(path.join(root, 'dist-two'))} };\n`,
		);
		await dev.waitForLog(`http://localhost:${port}`, 2);
		await waitForServer(port);
	} finally {
		await dev.stop();
	}
});

function createFixtureRoot() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flue-cli-dev-'));
	fixtureRoots.push(root);
	const scope = path.join(root, 'node_modules', '@flue');
	fs.mkdirSync(scope, { recursive: true });
	fs.symlinkSync(
		path.join(repositoryRoot, 'packages', 'runtime'),
		path.join(scope, 'runtime'),
		'dir',
	);
	return root;
}

function writeWorkflow(root, replace = false) {
	fs.mkdirSync(path.join(root, 'workflows'), { recursive: replace });
	fs.writeFileSync(
		path.join(root, 'workflows', 'smoke.mjs'),
		`import { defineAgent, defineWorkflow } from '@bapX/runtime';\nexport const route = async (_c, next) => next();\nexport default defineWorkflow({ agent: defineAgent(() => ({ model: 'anthropic/claude-haiku-4-5' })), async run() { return { ok: true }; } });\n`,
	);
}

function startDev(cwd, args, env = {}) {
	const child = spawn(process.execPath, [cli.pathname, 'dev', ...args], {
		cwd,
		env: { ...process.env, ...env },
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	let output = '';
	for (const stream of [child.stdout, child.stderr]) {
		stream.setEncoding('utf8');
		stream.on('data', (chunk) => {
			output += chunk;
		});
	}
	return {
		logs() {
			return output;
		},
		waitForLog(text, occurrences = 1) {
			return waitFor(
				() => output.split(text).length - 1 >= occurrences,
				`Timed out waiting for log: ${text}\n\n${output}`,
			);
		},
		async stop() {
			if (child.exitCode !== null || child.signalCode !== null) return;
			child.kill('SIGTERM');
			await Promise.race([
				once(child, 'exit'),
				new Promise((_, reject) =>
					setTimeout(() => reject(new Error(`Timed out stopping flue dev\n\n${output}`)), 5_000),
				),
			]);
		},
	};
}

async function waitForSelectedPort(logs) {
	let selected;
	await waitFor(
		() => {
			const match = logs().match(/http:\/\/localhost:(\d+)/);
			selected = match ? Number(match[1]) : undefined;
			return selected !== undefined;
		},
		() => `Timed out waiting for selected dev port\n\n${logs()}`,
	);
	return selected;
}

async function getAvailablePort() {
	const server = createServer();
	server.listen(0, '127.0.0.1');
	await once(server, 'listening');
	const address = server.address();
	assert(address && typeof address === 'object');
	server.close();
	await once(server, 'close');
	return address.port;
}

async function waitForServer(
	port,
	logs = () => '',
	workflow = 'smoke',
	expectedResult = { ok: true },
) {
	let body;
	await waitFor(
		async () => {
			try {
				const response = await fetch(`http://127.0.0.1:${port}/workflows/${workflow}?wait=result`, {
					method: 'POST',
				});
				body = await response.json();
				return response.ok && assert.deepEqual(body.result, expectedResult) === undefined;
			} catch {
				return false;
			}
		},
		() =>
			`Timed out waiting for server on port ${port}\nLast response: ${JSON.stringify(body)}\n\n${logs()}`,
	);
}

async function waitForUnavailable(port, state) {
	await waitFor(async () => {
		try {
			const response = await fetch(`http://127.0.0.1:${port}/workflows/smoke?wait=result`, {
				method: 'POST',
			});
			if (response.status !== 503) return false;
			const body = await response.json();
			return body.error?.type === 'runtime_unavailable' && body.error?.meta?.state === state;
		} catch {
			return false;
		}
	}, `Timed out waiting for runtime ${state} state on port ${port}`);
}

function waitForServerDown(port) {
	return waitFor(async () => {
		try {
			await fetch(`http://127.0.0.1:${port}/workflows/smoke?wait=result`, { method: 'POST' });
			return false;
		} catch {
			return true;
		}
	}, `Timed out waiting for server shutdown on port ${port}`);
}

async function waitFor(predicate, message, timeout = 20_000) {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		if (await predicate()) return;
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	throw new Error(typeof message === 'function' ? message() : message);
}
