// The signup path had 106 passing tests and was still completely broken in
// production: nothing here exercised githubIdentity, only the shape of the
// static manifest blob. These tests drive the real function against a stubbed
// GitHub so the front door cannot break silently again.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

function githubStub({ user, emails }) {
	return async (url) => {
		const target = String(url);
		if (target.startsWith('https://github.com/login/oauth/access_token')) {
			return { ok: true, json: async () => ({ access_token: 'gho_test' }) };
		}
		if (target === 'https://api.github.com/user') {
			return { ok: true, json: async () => user };
		}
		if (target === 'https://api.github.com/user/emails') {
			if (emails === 'forbidden') {
				// Exactly what a GitHub App without the `email` account
				// permission returns.
				return { ok: false, json: async () => ({ message: 'Resource not accessible by integration' }) };
			}
			return { ok: true, json: async () => emails };
		}
		throw new Error(`unexpected fetch: ${target}`);
	};
}

async function loadOAuth(t) {
	const previous = { id: process.env.GITHUB_CLIENT_ID, secret: process.env.GITHUB_CLIENT_SECRET };
	process.env.GITHUB_CLIENT_ID = 'Iv23test';
	process.env.GITHUB_CLIENT_SECRET = 'secret';
	t.after(() => {
		if (previous.id === undefined) delete process.env.GITHUB_CLIENT_ID;
		else process.env.GITHUB_CLIENT_ID = previous.id;
		if (previous.secret === undefined) delete process.env.GITHUB_CLIENT_SECRET;
		else process.env.GITHUB_CLIENT_SECRET = previous.secret;
	});
	return import(new URL(`../src/server/github-oauth.mjs?t=${Date.now()}${Math.random()}`, import.meta.url));
}

test('sign-in succeeds from the verified email list', async (t) => {
	const { githubIdentity } = await loadOAuth(t);
	const identity = await githubIdentity('code', {
		fetchImpl: githubStub({
			user: { id: 7, login: 'octo', name: 'Octo', email: null },
			emails: [{ email: 'listed@example.com', primary: true, verified: true }],
		}),
	});
	assert.deepEqual(identity, { id: '7', login: 'octo', name: 'Octo', email: 'listed@example.com', emailVerified: true });
});

test('sign-in survives a GitHub App that cannot read /user/emails', async (t) => {
	// This is the live outage. Before the fix /user/emails sat in a Promise.all
	// with /user, so this 403 rejected the whole sign-in.
	const { githubIdentity } = await loadOAuth(t);
	const identity = await githubIdentity('code', {
		fetchImpl: githubStub({
			user: { id: 7, login: 'octo', name: 'Octo', email: 'profile@example.com' },
			emails: 'forbidden',
		}),
	});
	assert.equal(identity.email, 'profile@example.com');
});

test('a blocked email list with no profile email names the missing permission', async (t) => {
	const { githubIdentity, GITHUB_EMAIL_PERMISSION_ERROR } = await loadOAuth(t);
	await assert.rejects(
		githubIdentity('code', {
			fetchImpl: githubStub({ user: { id: 7, login: 'octo', name: 'Octo', email: null }, emails: 'forbidden' }),
		}),
		(error) => {
			assert.equal(error.message, GITHUB_EMAIL_PERMISSION_ERROR);
			assert.match(error.message, /Email addresses/);
			return true;
		},
	);
});

test('the App manifest requests the email permission it depends on', async (t) => {
	const { githubAppManifestRegistration } = await loadOAuth(t);
	const { manifest } = githubAppManifestRegistration('bapXai');
	assert.equal(manifest.default_permissions.email, 'read');
});

test('a corrupt accounts file is storage failure, not "no accounts"', async (t) => {
	// The destructive path: readJson swallowed the parse error and returned the
	// empty fallback, so a truncated accounts.json read as zero accounts --
	// signing every customer out, and letting the next write persist the empty
	// set over all of them.
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bapx-store-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const { PlatformStorageError, createPlatformStore } = await import(
		new URL(`../src/server/platform-store.mjs?t=${Date.now()}`, import.meta.url)
	);
	assert.ok(PlatformStorageError, 'the store must expose a distinct storage-failure type');

	const collections = path.join(root, 'data/platform/collections');
	fs.mkdirSync(collections, { recursive: true });
	const accountsFile = path.join(collections, 'accounts.json');
	fs.writeFileSync(
		path.join(collections, 'sessions.json'),
		JSON.stringify({ schemaVersion: 2, sessions: [{ token: 'tok', accountId: 'a1', createdAt: new Date().toISOString() }] }),
	);
	// Truncated mid-record, exactly how a partial write or full disk leaves it.
	const truncated = '{"schemaVersion":2,"accounts":[{"id":"a1","username":"octo"';
	fs.writeFileSync(accountsFile, truncated);

	const store = createPlatformStore({ workspaceRoot: root });
	// Must fail loudly. Returning null here is what silently signed everyone out.
	assert.throws(() => store.getSessionAccount('tok'), PlatformStorageError);
	// And the bytes must be untouched, so an operator can still recover them.
	assert.equal(fs.readFileSync(accountsFile, 'utf8'), truncated);
});

test('writes keep the previous good copy', async (t) => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bapx-store-bak-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const { createPlatformStore } = await import(
		new URL(`../src/server/platform-store.mjs?t=${Date.now()}b`, import.meta.url)
	);
	const schemaFile = path.join(root, 'data/platform/schemas/accounts.schema.json');
	createPlatformStore({ workspaceRoot: root });
	assert.ok(fs.existsSync(schemaFile));
	// Second construction rewrites the same file and must leave a .bak behind.
	createPlatformStore({ workspaceRoot: root });
	assert.ok(fs.existsSync(`${schemaFile}.bak`), 'a rewrite must preserve the prior copy');
});

test('a profile-email fallback is reported as unverified', async (t) => {
	// GET /user returns the public profile email and GitHub does not guarantee it
	// is verified. The fallback keeps sign-in working without the App's `email`
	// permission, but callers must be able to tell the two apart — the store
	// refuses to attach an identity to an existing account on an unverified one.
	const { githubIdentity } = await loadOAuth(t);
	const identity = await githubIdentity('code', {
		fetchImpl: githubStub({
			user: { id: 9, login: 'octo', name: 'Octo', email: 'profile@example.com' },
			// The stub takes `emails`, not a status. 'forbidden' is the
			// permission-denied path this test is actually about.
			emails: 'forbidden',
		}),
	});
	assert.equal(identity.email, 'profile@example.com');
	assert.equal(identity.emailVerified, false, 'a profile-email fallback must not claim verification');
});

test('key storage failure is a throw, so sign-in must not depend on it', async (t) => {
	// The GitHub callback provisions a default API key. That call previously ran
	// BEFORE the session cookie was set, so an unusable key collection threw and
	// locked every GitHub user out of an account they had just proven they own.
	// This pins the hazard: these calls do throw, so the callback must create the
	// session first and treat provisioning as best-effort.
	const { createApiKeyStore } = await import('../src/server/api-gateway.mjs');
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bapx-keys-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));

	const store = createApiKeyStore({ workspaceRoot: root });
	const keysFile = path.join(root, 'data', 'platform', 'collections', 'api-keys.json');
	fs.mkdirSync(path.dirname(keysFile), { recursive: true });
	fs.writeFileSync(keysFile, '{ this is not valid json');

	assert.throws(() => store.hasEverIssued('any-account'), /corrupt/i);
	assert.throws(() => store.issue('any-account', 'Default key'), /corrupt/i);
});
