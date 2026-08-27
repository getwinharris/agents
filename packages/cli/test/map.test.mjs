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

// The map is committed, so it must be reproducible from a clean checkout. A raw
// directory walk is not: an untracked scratch directory under a mapped parent
// lands in the committed map, and `--check` then fails in CI while passing on
// the machine that generated it.
test('map ignores untracked directories so the committed map matches a clean checkout', (t) => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bapx-map-untracked-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));

	const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
	git('init', '--quiet');
	git('config', 'user.email', 'test@example.test');
	git('config', 'user.name', 'test');

	fs.mkdirSync(path.join(root, 'packages/kept'), { recursive: true });
	fs.writeFileSync(path.join(root, 'packages/kept/index.ts'), 'export {}\n');
	git('add', '-A');
	git('commit', '--quiet', '-m', 'tracked');

	const tracked = spawnSync(process.execPath, [cli, 'map', '--root', root], { encoding: 'utf8' });
	assert.equal(tracked.status, 0, tracked.stderr);
	const before = fs.readFileSync(path.join(root, 'map.mmd'), 'utf8');
	assert.match(before, /packages\/kept/, 'a tracked directory belongs in the map');

	// A scratch directory a developer happens to have locally, committed nowhere.
	fs.mkdirSync(path.join(root, 'packages/scratch'), { recursive: true });
	fs.writeFileSync(path.join(root, 'packages/scratch/notes.ts'), 'export {}\n');

	const regenerated = spawnSync(process.execPath, [cli, 'map', '--root', root], { encoding: 'utf8' });
	assert.equal(regenerated.status, 0, regenerated.stderr);
	assert.equal(fs.readFileSync(path.join(root, 'map.mmd'), 'utf8'), before, 'untracked directories must not change the map');
	assert.doesNotMatch(fs.readFileSync(path.join(root, 'map.mmd'), 'utf8'), /packages\/scratch/);

	// And the check must agree, which is what CI actually runs.
	const checked = spawnSync(process.execPath, [cli, 'map', '--root', root, '--check'], { encoding: 'utf8' });
	assert.equal(checked.status, 0, checked.stderr);
});

// A non-git root still maps, so the tracked-file lookup degrades rather than
// mapping nothing.
test('map still works outside a git repository', (t) => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bapx-map-nogit-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));

	fs.mkdirSync(path.join(root, 'packages/thing'), { recursive: true });
	fs.writeFileSync(path.join(root, 'packages/thing/index.ts'), 'export {}\n');

	const generated = spawnSync(process.execPath, [cli, 'map', '--root', root], { encoding: 'utf8' });
	assert.equal(generated.status, 0, generated.stderr);
	assert.match(fs.readFileSync(path.join(root, 'map.mmd'), 'utf8'), /packages\/thing/);
});
