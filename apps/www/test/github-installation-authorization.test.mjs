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

function createProvider(overrides = {}) {
	return createGitHubInstallationAuthorizationProvider({
		appId: '123',
		installationId: '456',
		privateKey: pem,
		now: () => Date.parse('2026-07-20T18:00:00Z'),
		...overrides,
	});
}

test('installation authorization requests metadata-only access for metadata operations', async () => {
	const requests = [];
	const provider = createProvider({
		fetchImpl: async (url, init) => {
			requests.push({ url, init });
			return response({
				token: 'metadata-token',
				expires_at: '2026-07-20T19:00:00Z',
				permissions: { metadata: 'read' },
			});
		},
	});

	const authorization = await provider({ permissions: { metadata: 'read' } });
	assert.deepEqual(authorization, {
		token: 'metadata-token',
		permissions: { metadata: 'read' },
	});
	assert.equal(requests.length, 1);
	assert.equal(requests[0].url, 'https://api.github.com/app/installations/456/access_tokens');
	assert.equal(requests[0].init.method, 'POST');
	assert.deepEqual(JSON.parse(requests[0].init.body), { permissions: { metadata: 'read' } });
	assert.match(requests[0].init.headers.Authorization, /^Bearer [^.]+\.[^.]+\.[^.]+$/);
	assert.ok(requests[0].init.signal);
});

test('installation authorization requests contents read only when the operation needs it', async () => {
	const requests = [];
	const provider = createProvider({
		fetchImpl: async (_url, init) => {
			requests.push(init);
			return response({
				token: 'contents-token',
				expires_at: '2026-07-20T19:00:00Z',
				permissions: { metadata: 'read', contents: 'read' },
			});
		},
	});

	const authorization = await provider({ permissions: { metadata: 'read', contents: 'read' } });
	assert.equal(authorization.token, 'contents-token');
	assert.deepEqual(JSON.parse(requests[0].body), {
		permissions: { metadata: 'read', contents: 'read' },
	});
});

test('installation authorization isolates cached tokens by normalized permission set', async () => {
	let calls = 0;
	const provider = createProvider({
		fetchImpl: async (_url, init) => {
			calls += 1;
			const permissions = JSON.parse(init.body).permissions;
			return response({
				token: permissions.contents ? 'contents-token' : 'metadata-token',
				expires_at: '2026-07-20T19:00:00Z',
				permissions,
			});
		},
	});

	assert.equal((await provider({ permissions: { metadata: 'read' } })).token, 'metadata-token');
	assert.equal((await provider({ permissions: { metadata: 'read' } })).token, 'metadata-token');
	assert.equal((await provider({ permissions: { contents: 'read', metadata: 'read' } })).token, 'contents-token');
	assert.equal((await provider({ permissions: { metadata: 'read', contents: 'read' } })).token, 'contents-token');
	assert.equal(calls, 2);
});

test('installation authorization reuses an unexpired token and refreshes near expiry per scope', async () => {
	let nowMs = Date.parse('2026-07-20T18:00:00Z');
	let calls = 0;
	const provider = createProvider({
		now: () => nowMs,
		fetchImpl: async (_url, init) => {
			calls += 1;
			return response({
				token: `token-${calls}`,
				expires_at: new Date(nowMs + 120_000).toISOString(),
				permissions: JSON.parse(init.body).permissions,
			});
		},
	});

	const request = { permissions: { metadata: 'read' } };
	assert.equal((await provider(request)).token, 'token-1');
	assert.equal((await provider(request)).token, 'token-1');
	assert.equal(calls, 1);
	nowMs += 61_000;
	assert.equal((await provider(request)).token, 'token-2');
	assert.equal(calls, 2);
});

test('installation authorization rejects unsupported, write, missing, and malformed scopes', async () => {
	const provider = createProvider({ fetchImpl: async () => { throw new Error('must not run'); } });
	for (const permissions of [
		undefined,
		null,
		{},
		{ metadata: 'write' },
		{ metadata: 'read', contents: 'write' },
		{ metadata: 'read', issues: 'read' },
		['metadata'],
	]) {
		await assert.rejects(provider({ permissions }), isUnavailable);
	}
});

test('installation authorization rejects token payloads that omit the requested scope', async () => {
	const provider = createProvider({
		fetchImpl: async () => response({
			token: 'under-scoped-token',
			expires_at: '2026-07-20T19:00:00Z',
			permissions: { metadata: 'read' },
		}),
	});
	await assert.rejects(
		provider({ permissions: { metadata: 'read', contents: 'read' } }),
		isUnavailable,
	);
});

test('installation authorization rejects over-scoped token payloads without caching them', async () => {
	let calls = 0;
	const provider = createProvider({
		fetchImpl: async () => {
			calls += 1;
			return response({
				token: `over-scoped-token-${calls}`,
				expires_at: '2026-07-20T19:00:00Z',
				permissions: { metadata: 'read', contents: 'write' },
			});
		},
	});
	const request = { permissions: { metadata: 'read', contents: 'read' } };
	await assert.rejects(provider(request), isUnavailable);
	await assert.rejects(provider(request), isUnavailable);
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

	const provider = createProvider({
		fetchImpl: async () => { throw new Error('sentinel-secret-token'); },
	});
	await assert.rejects(
		provider({ permissions: { metadata: 'read' } }),
		(error) => isUnavailable(error) && !error.message.includes('sentinel-secret-token'),
	);
});
