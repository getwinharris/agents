import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const login = fs.readFileSync(new URL('../src/pages/login/index.astro', import.meta.url), 'utf8');
const signup = fs.readFileSync(new URL('../src/pages/signup/index.astro', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');

test('login and signup expose GitHub as the only identity method', () => {
	for (const page of [login, signup]) {
		assert.match(page, /href="\/api\/auth\/oauth\/github"/);
		assert.doesNotMatch(page, /type="password"|\/api\/auth\/login|\/api\/auth\/signup|oauth\/google/i);
	}
});

test('the auth server owns GitHub callback and logout routes', () => {
	assert.match(server, /\/api\/auth\/oauth\/github\/callback/);
	assert.match(server, /\/api\/auth\/logout/);
	assert.doesNotMatch(server, /authenticatePassword|body\.password/);
});
