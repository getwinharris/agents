import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const login = fs.readFileSync(new URL('../src/pages/login/index.astro', import.meta.url), 'utf8');
const signup = fs.readFileSync(new URL('../src/pages/signup/index.astro', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const store = fs.readFileSync(new URL('../src/server/platform-store.mjs', import.meta.url), 'utf8');

test('login and signup offer GitHub and email/password, and nothing else', () => {
	for (const page of [login, signup]) {
		assert.match(page, /href="\/api\/auth\/oauth\/github"/);
		assert.match(page, /type="password"/);
		// Third-party identity beyond GitHub is not shipped yet (#104).
		assert.doesNotMatch(page, /oauth\/google|oauth\/microsoft|oauth\/apple/i);
		// The App-manifest bootstrap is an operator flow, never a customer sign-in path.
		assert.doesNotMatch(page, /Configure bapX GitHub App|github-setup|\/api\/auth\/oauth\/github\/manifest/);
	}
	assert.match(login, /data-action="\/api\/auth\/password\/login"/);
	assert.match(signup, /data-action="\/api\/auth\/password\/register"/);
});

test('the auth server owns GitHub callback and logout routes', () => {
	assert.match(server, /\/api\/auth\/oauth\/github\/callback/);
	assert.match(server, /\/api\/auth\/logout/);
});

test('password routes are same-origin gated and body-capped', () => {
	assert.match(server, /'\/api\/auth\/password\/register'|"\/api\/auth\/password\/register"/);
	assert.match(server, /'\/api\/auth\/password\/login'|"\/api\/auth\/password\/login"/);
	assert.match(server, /cross_origin_forbidden/);
	assert.match(server, /readRawBody\(req, 16 \* 1024\)/);
});

test('passwords are salted scrypt and never leave the store', () => {
	assert.match(store, /crypto\.scryptSync/);
	assert.match(store, /crypto\.randomBytes\(16\)/);
	assert.match(store, /timingSafeEqual/);
	// Every account read that can reach a response must strip the credential.
	assert.doesNotMatch(store, /return \{ account \}/);
	assert.match(store, /passwordHash: undefined|passwordHash: _passwordHash/);
});
