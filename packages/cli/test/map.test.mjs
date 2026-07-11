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
