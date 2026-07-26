import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
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

async function withOkfBundle(callback) {
	const root = await mkdtemp(path.join(tmpdir(), 'bapx-okf-'));
	try {
		await mkdir(path.join(root, 'connectors'), { recursive: true });
		await writeFile(
			path.join(root, 'billing.md'),
			`---\ntype: Connector\ntitle: Razorpay billing connector\ndescription: Handles INR subscription and storage billing.\ntags: [billing, payments]\ntimestamp: 2026-07-10T12:00:00Z\n---\n\n# Contract\n\nThe connector bills base subscriptions in INR and records payment evidence.\n`,
		);
		await writeFile(
			path.join(root, 'connectors', 'github.md'),
			`---\ntype: Channel\ntitle: GitHub workspace channel\ndescription: Links repositories to project knowledge.\ntags: [github, repository]\nstatus: verified\nstale_after: 2026-08-30\ngenerated:\n  at: 2026-07-25T08:00:00Z\nverified:\n  at: 2026-07-26T08:30:00Z\nsources: [https://docs.github.com/en/apps/oauth-apps]\n---\n\n# Usage\n\nUse OAuth for user identity and installation credentials for durable repository automation.\n`,
		);
		await callback(root);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

describe('bapX okf', () => {
	it('indexes Markdown concepts with v0.1 and v0.2 metadata when root is explicit', async () => {
		await withOkfBundle(async (root) => {
			const result = await runCli(['okf', 'index', '--root', root]);
			assert.equal(result.code, 0);

			const payload = JSON.parse(result.stdout);
			assert.equal(payload.schema, 'bapx.okf.index.v1');
			assert.equal(payload.root, root);
			assert.equal(payload.conceptCount, 2);
			assert.deepEqual(
				payload.concepts.map((concept) => concept.path),
				['billing.md', 'connectors/github.md'],
			);
			const github = payload.concepts.find((concept) => concept.path === 'connectors/github.md');
			assert.equal(github.status, 'verified');
			assert.equal(github.staleAfter, '2026-08-30');
			assert.equal(github.generatedAt, '2026-07-25T08:00:00Z');
			assert.equal(github.verifiedAt, '2026-07-26T08:30:00Z');
			assert.equal(github.sourceCount, 1);
			assert.ok(!Object.hasOwn(github, 'body'));
		});
	});

	it('queries Markdown concepts and returns evidence paths and trust fields', async () => {
		await withOkfBundle(async (root) => {
			const result = await runCli(['okf', 'query', '--root', root, 'github repository identity']);
			assert.equal(result.code, 0);

			const payload = JSON.parse(result.stdout);
			assert.equal(payload.schema, 'bapx.okf.query.v1');
			assert.equal(payload.query, 'github repository identity');
			assert.ok(payload.results.length > 0);
			assert.equal(payload.results[0].path, 'connectors/github.md');
			assert.equal(payload.results[0].status, 'verified');
			assert.equal(payload.results[0].sourceCount, 1);
			assert.match(payload.results[0].excerpt, /repository/i);
		});
	});

	it('keeps index output inside the requested OKF root', async () => {
		await withOkfBundle(async (root) => {
			const outside = path.join(path.dirname(root), 'leaked-index.json');
			const result = await runCli(['okf', 'index', '--root', root, '--output', outside]);
			assert.equal(result.code, 1);
			assert.equal(result.stdout, '');
			assert.match(result.stderr, /must stay inside the OKF root/);
		});
	});

	it('writes an index file when the output remains inside the OKF root', async () => {
		await withOkfBundle(async (root) => {
			const output = path.join(root, '.bapx-okf-index.json');
			const result = await runCli(['okf', 'index', '--root', root, '--output', output]);
			assert.equal(result.code, 0);
			assert.equal(result.stdout, '');
			const payload = JSON.parse(await readFile(output, 'utf8'));
			assert.equal(payload.conceptCount, 2);
		});
	});
});
