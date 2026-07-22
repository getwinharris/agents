import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../dist/bapX.js', import.meta.url));

test('map success output never prints the return value of the terminal presenter', (t) => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bapx-map-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));

	const written = spawnSync(process.execPath, [cli, 'map', '--root', root], { encoding: 'utf8' });
	assert.equal(written.status, 0);
	assert.doesNotMatch(written.stderr, /^undefined$/m);
	const checked = spawnSync(process.execPath, [cli, 'map', '--root', root, '--check'], { encoding: 'utf8' });
	assert.equal(checked.status, 0);
	assert.doesNotMatch(checked.stderr, /^undefined$/m);
});

test('map profile validation requires OKF index.yaml for user project workspaces', (t) => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bapx-map-profile-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));

	fs.writeFileSync(path.join(root, 'index.yaml'), 'title: Project\n');
	fs.writeFileSync(path.join(root, 'map.mmd'), 'flowchart TD\n');
	fs.mkdirSync(path.join(root, 'docs'));
	fs.writeFileSync(path.join(root, 'docs/index.yaml'), 'title: Docs\n');
	fs.writeFileSync(path.join(root, 'docs/map.mmd'), 'flowchart TD\n');

	const generated = spawnSync(process.execPath, [cli, 'map', '--root', root], { encoding: 'utf8' });
	assert.equal(generated.status, 0, generated.stderr);

	const checked = spawnSync(
		process.execPath,
		[cli, 'map', '--root', root, '--check', '--profile', 'user-project'],
		{ encoding: 'utf8' },
	);
	assert.equal(checked.status, 0, checked.stderr);
});

test('map profile validation rejects legacy index.md without index.yaml for user projects', (t) => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bapx-map-profile-legacy-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));

	fs.writeFileSync(path.join(root, 'index.md'), '# Project\n');
	fs.writeFileSync(path.join(root, 'map.mmd'), 'flowchart TD\n');
	fs.mkdirSync(path.join(root, 'docs'));
	fs.writeFileSync(path.join(root, 'docs/index.md'), '# Docs\n');
	fs.writeFileSync(path.join(root, 'docs/map.mmd'), 'flowchart TD\n');

	const generated = spawnSync(process.execPath, [cli, 'map', '--root', root], { encoding: 'utf8' });
	assert.equal(generated.status, 0, generated.stderr);

	const checked = spawnSync(
		process.execPath,
		[cli, 'map', '--root', root, '--check', '--profile', 'user-project'],
		{ encoding: 'utf8' },
	);
	assert.equal(checked.status, 1);
	assert.match(checked.stderr, /index\.yaml/);
	assert.match(checked.stderr, /docs\/index\.yaml/);
});
