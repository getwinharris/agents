import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import {
	GitHubInstallationAuthorizationError,
	createGitHubInstallationAuthorizationProvider,
} from '../src/server/github-installation-authorization.mjs';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });

function response(payload, ok = true) {
	return { ok, async json() { return payload; } };
}

function isUnavailable(error) {
	return error instanceof GitHubInstallationAuthorizationError && error.code === 'github_installation_unavailable';
}

test('installation authorization requests least-privilege metadata and contents access', async () => {
	const requests = [];
	const provider = createGitHubInstallationAuthorizationProvider({
		appId: '123',
		installationId: '456',
		privateKey: pem,
		now: () => Date.parse('2026-07-20T18:00:00Z'),
		fetchImpl: async (url, init) => {
			requests.push({ url, init });
			return response({
				token: 'opaque-installation-token',
				expires_at: '2026-07-20T19:00:00Z',
				permissions: { metadata: 'read', contents: 'read' },
			});
		},
	});

	const authorization = await provider();
	assert.deepEqual(authorization, {
		token: 'opaque-installation-token',
		permissions: { metadata: 'read', contents: 'read' },
	});
	assert.equal(requests.length, 1);
	assert.equal(requests[0].url, 'https://api.github.com/app/installations/456/access_tokens');
	assert.equal(requests[0].init.method, 'POST');
	assert.deepEqual(JSON.parse(requests[0].init.body), { permissions: { metadata: 'read', contents: 'read' } });
	assert.match(requests[0].init.headers.Authorization, /^Bearer [^.]+\.[^.]+\.[^.]+$/);
	assert.ok(requests[0].init.signal);
});

test('installation authorization reuses an unexpired token and refreshes near expiry', async () => {
	let nowMs = Date.parse('2026-07-20T18:00:00Z');
	let calls = 0;
	const provider = createGitHubInstallationAuthorizationProvider({
		appId: 123,
		installationId: 456,
		privateKey: pem,
		now: () => nowMs,
		fetchImpl: async () => {
			calls += 1;
			return response({
				token: `token-${calls}`,
				expires_at: new Date(nowMs + 120_000).toISOString(),
				permissions: { metadata: 'read', contents: 'read' },
			});
		},
	});

	assert.equal((await provider()).token, 'token-1');
	assert.equal((await provider()).token, 'token-1');
	assert.equal(calls, 1);
	nowMs += 61_000;
	assert.equal((await provider()).token, 'token-2');
	assert.equal(calls, 2);
});

test('installation authorization rejects malformed identifiers exactly', () => {
	for (const invalid of ['', ' ', '0', '-1', '+1', '1.5', '123abc', '01', '9007199254740992']) {
		assert.throws(
			() => createGitHubInstallationAuthorizationProvider({ appId: invalid, installationId: '456', privateKey: pem }),
			isUnavailable,
			`expected appId ${JSON.stringify(invalid)} to fail closed`,
		);
		assert.throws(
			() => createGitHubInstallationAuthorizationProvider({ appId: '123', installationId: invalid, privateKey: pem }),
			isUnavailable,
			`expected installationId ${JSON.stringify(invalid)} to fail closed`,
		);
	}
});

test('configuration and upstream failures are stable and secret-free', async () => {
	assert.throws(
		() => createGitHubInstallationAuthorizationProvider({ appId: '', installationId: '456', privateKey: pem }),
		isUnavailable,
	);

	const provider = createGitHubInstallationAuthorizationProvider({
		appId: '123',
		installationId: '456',
		privateKey: pem,
		fetchImpl: async () => { throw new Error('sentinel-secret-token'); },
	});
	await assert.rejects(
		provider(),
		(error) => isUnavailable(error) && !error.message.includes('sentinel-secret-token'),
	);
});
