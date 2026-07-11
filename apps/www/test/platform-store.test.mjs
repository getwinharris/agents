import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createPlatformStore } from '../src/server/platform-store.mjs';

test('signup creates an account, user workspace, and owned business', async (t) => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bapx-platform-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	fs.writeFileSync(path.join(root, 'OKF.md'), '# OKF\n');

	const store = createPlatformStore({ workspaceRoot: root });
	const result = await store.signup({
		username: 'mediahub',
		name: 'Bapx Media Hub',
		email: 'bapxmediahub@gmail.com',
		password: 'correct horse battery staple',
		business: { name: 'Bapx Media Hub', slug: 'bapx-media-hub' },
	});

	assert.equal(result.account.username, 'mediahub');
	assert.equal(result.business.owner, 'mediahub');
	assert.equal(result.account.passwordHash.includes('correct horse'), false);
	assert.equal(fs.existsSync(path.join(root, 'users/mediahub/.git')), true);
	assert.equal(fs.readFileSync(path.join(root, 'users/mediahub/OKF.md'), 'utf8'), '# OKF\n');
	assert.equal(fs.existsSync(path.join(root, 'users/mediahub/bapx-media-hub/DESIGN.md')), true);
	assert.equal(fs.existsSync(path.join(root, 'users/mediahub/bapx-media-hub/collections/business.json')), true);
	assert.equal(fs.existsSync(path.join(root, 'data/platform/schemas/accounts.schema.json')), true);
	assert.equal(fs.existsSync(path.join(root, 'data/platform/schemas/sessions.schema.json')), true);
});

test('password authentication accepts the stored account password', async (t) => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bapx-platform-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	fs.writeFileSync(path.join(root, 'OKF.md'), '# OKF\n');
	const store = createPlatformStore({ workspaceRoot: root });

	await store.signup({
		username: 'harris',
		name: 'Harris',
		email: 'harris@example.com',
		password: 'a secure password',
		business: { name: 'Example Business', slug: 'example-business' },
	});

	assert.equal((await store.authenticatePassword('harris@example.com', 'a secure password')).username, 'harris');
	assert.equal(await store.authenticatePassword('harris@example.com', 'wrong password'), null);
});

test('sessions persist without exposing the account password hash', async (t) => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bapx-platform-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	fs.writeFileSync(path.join(root, 'OKF.md'), '# OKF\n');
	const store = createPlatformStore({ workspaceRoot: root });
	const { account } = await store.signup({
		username: 'owner', name: 'Owner', email: 'owner@example.com', password: 'a secure password',
		business: { name: 'Owner Business', slug: 'owner-business' },
	});

	const session = store.createSession(account.id);
	const current = store.getSessionAccount(session.token);

	assert.equal(current.username, 'owner');
	assert.equal('passwordHash' in current, false);
});
