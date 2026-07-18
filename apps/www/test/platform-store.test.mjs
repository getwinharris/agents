import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createPlatformStore } from '../src/server/platform-store.mjs';

test('GitHub login creates an account, user workspace, and owned business', async (t) => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bapx-platform-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	fs.writeFileSync(path.join(root, 'OKF.md'), '# OKF\n');

	const store = createPlatformStore({ workspaceRoot: root });
	const result = await store.loginWithGitHub({
		id: '12345',
		login: 'mediahub',
		name: 'Bapx Media Hub',
		email: 'bapxmediahub@gmail.com',
	});

	assert.equal(result.account.username, 'mediahub');
	assert.equal(result.business.owner, 'mediahub');
	assert.deepEqual(result.account.providers, [{ id: '12345', login: 'mediahub', name: 'github' }]);
	assert.equal('passwordHash' in result.account, false);
	assert.equal(fs.existsSync(path.join(root, 'users/mediahub/.git')), true);
	assert.equal(fs.readFileSync(path.join(root, 'users/mediahub/OKF.md'), 'utf8'), '# OKF\n');
	assert.equal(fs.existsSync(path.join(root, 'users/mediahub/workspace/DESIGN.md')), true);
	assert.equal(fs.existsSync(path.join(root, 'users/mediahub/workspace/collections/business.json')), true);
	assert.equal(fs.existsSync(path.join(root, 'data/platform/schemas/accounts.schema.json')), true);
	assert.equal(fs.existsSync(path.join(root, 'data/platform/schemas/sessions.schema.json')), true);
});

test('GitHub provider id returns the existing account without creating another workspace', async (t) => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bapx-platform-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	fs.writeFileSync(path.join(root, 'OKF.md'), '# OKF\n');
	const store = createPlatformStore({ workspaceRoot: root });

	const first = await store.loginWithGitHub({ id: '67890', login: 'harris', name: 'Harris', email: 'harris@example.com' });
	const second = await store.loginWithGitHub({ id: '67890', login: 'renamed-harris', name: 'Harris', email: 'harris@example.com' });

	assert.equal(second.created, false);
	assert.equal(second.account.id, first.account.id);
	assert.equal(fs.readdirSync(path.join(root, 'users')).length, 1);
});

test('device sessions persist until explicit logout', async (t) => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bapx-platform-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	fs.writeFileSync(path.join(root, 'OKF.md'), '# OKF\n');
	const store = createPlatformStore({ workspaceRoot: root });
	const { account } = await store.loginWithGitHub({ id: '24680', login: 'owner', name: 'Owner', email: 'owner@example.com' });

	const session = store.createSession(account.id);
	const current = store.getSessionAccount(session.token);

	assert.equal(current.username, 'owner');
	assert.equal('expiresAt' in session, false);
	assert.equal(store.deleteSession(session.token), true);
	assert.equal(store.getSessionAccount(session.token), null);
});
