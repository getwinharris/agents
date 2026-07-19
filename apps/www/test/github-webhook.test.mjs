import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const server = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');

test('the public GitHub webhook route verifies signed payloads before authentication routing', () => {
	assert.match(server, /\/api\/channels\/github\/webhook/);
	assert.match(server, /GITHUB_WEBHOOK_SECRET/);
	assert.match(server, /x-hub-signature-256/);
	assert.match(server, /timingSafeEqual/);
	assert.match(server, /x-github-delivery/);
	assert.match(server, /event === 'ping' \? 200 : 202/);
});
