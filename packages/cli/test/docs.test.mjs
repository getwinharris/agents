import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { embedDocsCatalog } from '../../../scripts/prepare-publish.mjs';

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

describe('bapX docs', () => {
	it('lists readable page paths on stdout when run without arguments', async () => {
		const list = await runCli(['docs']);
		assert.equal(list.code, 0);

		const lines = list.stdout.trim().split('\n');
		assert.ok(lines.length > 20, `expected a catalog of pages, got ${lines.length} lines`);

		assert.ok(!list.stdout.includes('bapX docs read <path>'));
		assert.ok(list.stderr.includes('bapX docs read <path>'));
		for (let index = 0; index < lines.length; index += 1) {
			const line = lines[index];
			if (line.startsWith('  ')) {
				assert.ok(line.slice(2).length <= 120);
				continue;
			}
			assert.match(line, /^[^ ]+ -- .+$/);
			if (line.startsWith('ecosystem/')) {
				assert.ok(!lines[index + 1]?.startsWith('  '));
			} else {
				assert.match(lines[index + 1], /^ {2}\S.+$/);
			}
		}

		const firstPath = lines[0].split(' -- ')[0];
		const read = await runCli(['docs', 'read', firstPath]);
		assert.equal(read.code, 0);
		assert.ok(read.stdout.startsWith('# '), 'page output starts with a markdown title');
	});

	it('accepts website URL forms when reading a page', async () => {
		const list = await runCli(['docs']);
		const firstPath = list.stdout.trim().split('\n')[0].split(' -- ')[0];

		const plain = await runCli(['docs', 'read', firstPath]);
		const urlForm = await runCli(['docs', 'read', `/docs/${firstPath}/`]);
		assert.equal(urlForm.code, 0);
		assert.equal(urlForm.stdout, plain.stdout);
	});

	it('exits with guidance when the page is unknown', async () => {
		const result = await runCli(['docs', 'read', 'not/a-real-page']);
		assert.equal(result.code, 1);
		assert.equal(result.stdout, '');
		assert.ok(result.stderr.includes('bapX docs search'));
	});

	it('prints valid JSON results with readable paths when searching', async () => {
		const result = await runCli(['docs', 'search', 'agent']);
		assert.equal(result.code, 0);

		const payload = JSON.parse(result.stdout);
		assert.equal(payload.query, 'agent');
		assert.ok(payload.results.length > 0, 'expected at least one result');
		for (const entry of payload.results) {
			assert.equal(typeof entry.path, 'string');
			assert.equal(typeof entry.title, 'string');
			assert.equal(typeof entry.excerpt, 'string');
			assert.equal(typeof entry.score, 'number');
		}

		const read = await runCli(['docs', 'read', payload.results[0].path]);
		assert.equal(read.code, 0);
	});

	it('exits with usage when the search query is missing', async () => {
		const result = await runCli(['docs', 'search']);
		assert.equal(result.code, 1);
		assert.ok(result.stderr.includes('bapX docs search <query>'));
	});

	it('embeds the catalog between skill markers without changing authored content', () => {
		const source = `before\n<!-- bapX-docs-catalog:start -->\nold\n<!-- bapX-docs-catalog:end -->\nafter\n`;
		assert.equal(
			embedDocsCatalog(source, 'guide/channels -- Channels\n  Receive provider events.\n'),
			`before\n<!-- bapX-docs-catalog:start -->\n\n\`\`\`text\nguide/channels -- Channels\n  Receive provider events.\n\`\`\`\n\n<!-- bapX-docs-catalog:end -->\nafter\n`,
		);
	});

	it('keeps the tracked skill catalog synchronized with bapX docs', async () => {
		const list = await runCli(['docs']);
		assert.equal(list.code, 0);
		const skillUrl = new URL('../../../skills/bapX/SKILL.md', import.meta.url);
		const skillSource = await readFile(skillUrl, 'utf8');
		assert.equal(embedDocsCatalog(skillSource, list.stdout), skillSource);
	});
});
