import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createPlatformStore } from '../src/server/platform-store.mjs';

function createFixture() {
	const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bapx-admin-handoff-'));
	const store = createPlatformStore({ workspaceRoot });
	const account = {
		id: 'account-1',
		username: 'admin-user',
		name: 'Admin User',
		email: 'admin@example.com',
		providers: [{ name: 'github', id: '123' }],
		createdAt: '2026-07-19T00:00:00.000Z',
		updatedAt: '2026-07-19T00:00:00.000Z',
	};
	const accountsFile = path.join(workspaceRoot, 'data/platform/collections/accounts.json');
	fs.mkdirSync(path.dirname(accountsFile), { recursive: true });
	fs.writeFileSync(accountsFile, `${JSON.stringify({ schemaVersion: 2, accounts: [account] }, null, 2)}\n`);
	return { workspaceRoot, store, account };
}

function validStoredHandoff(overrides = {}) {
	return {
		tokenHash: 'a'.repeat(64),
		accountId: 'account-1',
		audience: 'admin',
		createdAt: new Date(1_000).toISOString(),
		expiresAt: new Date(61_000).toISOString(),
		...overrides,
	};
}

test('stores only a digest and redeems an Admin handoff exactly once', () => {
	const { workspaceRoot, store, account } = createFixture();
	const handoff = store.createAdminHandoff(account.id, { now: 1_000 });
	const stored = JSON.parse(
		fs.readFileSync(path.join(workspaceRoot, 'data/platform/collections/admin-handoffs.json'), 'utf8'),
	);

	assert.equal(stored.handoffs.length, 1);
	assert.notEqual(stored.handoffs[0].tokenHash, handoff.token);
	assert.equal(JSON.stringify(stored).includes(handoff.token), false);
	assert.equal(handoff.expiresAt, new Date(61_000).toISOString());
	assert.deepEqual(store.redeemAdminHandoff(handoff.token, { now: 60_999 }), account);
	assert.equal(store.redeemAdminHandoff(handoff.token, { now: 61_000 }), null);
});

test('expires at the exact module-owned 60-second boundary', () => {
	const { store, account } = createFixture();
	const handoff = store.createAdminHandoff(account.id, { now: 1_000, ttlMs: Number.MAX_SAFE_INTEGER });

	assert.equal(handoff.expiresAt, new Date(61_000).toISOString());
	assert.deepEqual(store.redeemAdminHandoff(handoff.token, { now: 60_999 }), account);

	const expired = store.createAdminHandoff(account.id, { now: 100_000 });
	assert.equal(store.redeemAdminHandoff(expired.token, { now: 160_000 }), null);
});

test('rejects malformed and wrong-audience handoffs', () => {
	const { store, account } = createFixture();
	const valid = store.createAdminHandoff(account.id, { now: 3_000 });
	assert.equal(store.redeemAdminHandoff(valid.token, { audience: 'agents', now: 3_500 }), null);
	assert.deepEqual(store.redeemAdminHandoff(valid.token, { now: 3_500 }), account);
	for (const token of ['', null, 123, {}, []]) {
		assert.equal(store.redeemAdminHandoff(token, { now: 3_500 }), null);
	}
	assert.throws(() => store.createAdminHandoff(account.id, { audience: 'agents', now: 3_000 }), /Invalid Admin handoff/);
	assert.throws(() => store.createAdminHandoff(account.id, { now: Number.NaN }), /Invalid Admin handoff/);
	assert.throws(() => store.createAdminHandoff(account.id, { now: Number.MAX_SAFE_INTEGER }), /Invalid Admin handoff/);
});

test('invalid redemption time cannot erase unrelated handoffs', () => {
	const { workspaceRoot, store, account } = createFixture();
	const first = store.createAdminHandoff(account.id, { now: 1_000 });
	const second = store.createAdminHandoff(account.id, { now: 2_000 });
	const handoffsFile = path.join(workspaceRoot, 'data/platform/collections/admin-handoffs.json');
	const before = fs.readFileSync(handoffsFile, 'utf8');

	for (const now of [Number.NaN, -1, 1.5, Number.MAX_SAFE_INTEGER]) {
		assert.equal(store.redeemAdminHandoff(first.token, { now }), null);
		assert.equal(fs.readFileSync(handoffsFile, 'utf8'), before);
	}

	assert.deepEqual(store.redeemAdminHandoff(first.token, { now: 2_500 }), account);
	assert.deepEqual(store.redeemAdminHandoff(second.token, { now: 2_500 }), account);
});

test('removes expired records while creating and redeeming handoffs', () => {
	const { workspaceRoot, store, account } = createFixture();
	store.createAdminHandoff(account.id, { now: 1_000 });
	const current = store.createAdminHandoff(account.id, { now: 70_000 });
	let stored = JSON.parse(
		fs.readFileSync(path.join(workspaceRoot, 'data/platform/collections/admin-handoffs.json'), 'utf8'),
	);
	assert.equal(stored.handoffs.length, 1);

	assert.deepEqual(store.redeemAdminHandoff(current.token, { now: 70_500 }), account);
	stored = JSON.parse(
		fs.readFileSync(path.join(workspaceRoot, 'data/platform/collections/admin-handoffs.json'), 'utf8'),
	);
	assert.equal(stored.handoffs.length, 0);
});

test('fails closed without overwriting corrupted or unsupported handoff storage', () => {
	const { workspaceRoot, store, account } = createFixture();
	const handoffsFile = path.join(workspaceRoot, 'data/platform/collections/admin-handoffs.json');

	for (const contents of [
		'{not-json',
		`${JSON.stringify({ schemaVersion: 2, handoffs: [] }, null, 2)}\n`,
		`${JSON.stringify({ schemaVersion: 1, handoffs: null }, null, 2)}\n`,
	]) {
		fs.mkdirSync(path.dirname(handoffsFile), { recursive: true });
		fs.writeFileSync(handoffsFile, contents);
		const before = fs.readFileSync(handoffsFile, 'utf8');

		assert.throws(() => store.createAdminHandoff(account.id, { now: 1_000 }));
		assert.equal(fs.readFileSync(handoffsFile, 'utf8'), before);
		assert.throws(() => store.redeemAdminHandoff('unknown-token', { now: 1_000 }));
		assert.equal(fs.readFileSync(handoffsFile, 'utf8'), before);
	}
});

test('fails closed on malformed persisted records without changing bytes', () => {
	const { workspaceRoot, store, account } = createFixture();
	const handoffsFile = path.join(workspaceRoot, 'data/platform/collections/admin-handoffs.json');
	const malformedRecords = [
		{},
		validStoredHandoff({ tokenHash: 'not-a-digest' }),
		validStoredHandoff({ accountId: '' }),
		validStoredHandoff({ audience: 'agents' }),
		validStoredHandoff({ createdAt: 'not-a-date' }),
		validStoredHandoff({ expiresAt: 'not-a-date' }),
		validStoredHandoff({ expiresAt: new Date(60_999).toISOString() }),
	];

	for (const record of malformedRecords) {
		const contents = `${JSON.stringify({ schemaVersion: 1, handoffs: [record] }, null, 2)}\n`;
		fs.mkdirSync(path.dirname(handoffsFile), { recursive: true });
		fs.writeFileSync(handoffsFile, contents);

		assert.throws(() => store.createAdminHandoff(account.id, { now: 2_000 }), /Corrupted or unsupported/);
		assert.equal(fs.readFileSync(handoffsFile, 'utf8'), contents);
		assert.throws(() => store.redeemAdminHandoff('unknown-token', { now: 2_000 }), /Corrupted or unsupported/);
		assert.equal(fs.readFileSync(handoffsFile, 'utf8'), contents);
	}
});

test('failed redemption leaves valid handoff storage byte-for-byte unchanged', () => {
	const { workspaceRoot, store, account } = createFixture();
	store.createAdminHandoff(account.id, { now: 1_000 });
	const handoffsFile = path.join(workspaceRoot, 'data/platform/collections/admin-handoffs.json');
	const before = fs.readFileSync(handoffsFile, 'utf8');

	assert.equal(store.redeemAdminHandoff('unknown-token', { now: 2_000 }), null);
	assert.equal(fs.readFileSync(handoffsFile, 'utf8'), before);
});
