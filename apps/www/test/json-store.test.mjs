import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, beforeEach } from 'node:test';
import { readJson, writeJson } from '../src/server/json-store.mjs';

// This helper was copy-pasted three times and the copies drifted on durability:
// only platform-store fsynced and kept a backup, while the two stores holding
// encrypted connector credentials and customer API keys did neither.

describe('durable JSON collection store', () => {
	let dir;
	let file;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bapx-json-store-'));
		file = path.join(dir, 'nested', 'collection.json');
	});

	it('creates parent directories and round-trips', () => {
		writeJson(file, { keys: [1, 2] });
		assert.deepEqual(readJson(file, null, 'test'), { keys: [1, 2] });
	});

	it('treats only a missing file as first-run', () => {
		assert.deepEqual(readJson(file, { keys: [] }, 'test'), { keys: [] });
	});

	// The dangerous case: a corrupt file must never read as "empty", or the next
	// write persists an empty-derived collection and deletes every record.
	it('refuses to read a corrupt file as empty', () => {
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, '{not json');
		assert.throws(() => readJson(file, { keys: [] }, 'test'), /corrupt/i);
	});

	it('keeps the previous good copy as a backup', () => {
		writeJson(file, { generation: 1 });
		writeJson(file, { generation: 2 });
		assert.deepEqual(readJson(file, null, 'test'), { generation: 2 });
		assert.deepEqual(JSON.parse(fs.readFileSync(`${file}.bak`, 'utf8')), { generation: 1 });
	});

	it('writes with owner-only permissions', () => {
		writeJson(file, { secret: true });
		assert.equal(fs.statSync(file).mode & 0o777, 0o600);
	});

	// `${file}.${pid}.tmp` was the same path for two concurrent writes in one
	// process, so one could truncate the other's half-written file.
	it('leaves no temp files behind after concurrent writes', () => {
		for (let i = 0; i < 25; i += 1) writeJson(file, { i });
		const leftovers = fs.readdirSync(path.dirname(file)).filter((name) => name.endsWith('.tmp'));
		assert.deepEqual(leftovers, [], 'temp files must be renamed, never abandoned');
	});

	it('lets a caller keep its own typed error', () => {
		class TypedError extends Error {}
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, '{not json');
		assert.throws(
			() => readJson(file, null, 'test', () => new TypedError('typed')),
			TypedError,
		);
	});
});
