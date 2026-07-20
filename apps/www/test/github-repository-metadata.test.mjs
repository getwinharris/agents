import assert from 'node:assert/strict';
import test from 'node:test';
import {
	GitHubRepositoryMetadataError,
	resolveAuthorizedGitHubRepositoryMetadata,
} from '../src/server/github-repository-metadata.mjs';

const reference = {
	owner: 'getwinharris',
	repository: 'agents',
	fullName: 'getwinharris/agents',
	httpsUrl: 'https://github.com/getwinharris/agents.git',
};

function response(status, payload) {
	return {
		ok: status >= 200 && status < 300,
		status,
		async json() { return payload; },
	};
}

function metadata(overrides = {}) {
	return {
		id: 1294736347,
		full_name: 'getwinharris/agents',
		owner: { type: 'User' },
		default_branch: 'main',
		visibility: 'public',
		private: false,
		archived: false,
		...overrides,
	};
}

async function resolve({ token = 'opaque-variable-length-token', permissions = { metadata: 'read' }, fetchImpl } = {}) {
	return resolveAuthorizedGitHubRepositoryMetadata({ ...reference }, {
		getInstallationToken: async () => ({ token, permissions }),
		fetchImpl: fetchImpl || (async () => response(200, metadata())),
	});
}

test('normalizes safe public metadata and preserves GitHub canonical casing', async () => {
	const result = await resolve({
		permissions: { metadata: 'read', contents: 'read' },
		fetchImpl: async (url, options) => {
			assert.equal(url, 'https://api.github.com/repos/getwinharris/agents');
			assert.equal(options.headers.Authorization, 'Bearer opaque-variable-length-token');
			assert.equal(options.signal instanceof AbortSignal, true);
			return response(200, metadata({ full_name: 'GetWinHarris/Agents' }));
		},
	});
	assert.deepEqual(result, {
		repositoryId: 1294736347,
		fullName: 'GetWinHarris/Agents',
		ownerType: 'User',
		defaultBranch: 'main',
		visibility: 'public',
		private: false,
		archived: false,
		cloneAuthorized: true,
		status: 'resolved',
	});
});

test('treats read and write Contents permissions as clone-authorized', async () => {
	for (const contents of ['read', 'write']) {
		const result = await resolve({ permissions: { metadata: 'read', contents } });
		assert.equal(result.cloneAuthorized, true);
	}
});

test('keeps private visibility and metadata authorization separate from clone authorization', async () => {
	const result = await resolve({
		fetchImpl: async () => response(200, metadata({ visibility: 'private', private: true })),
	});
	assert.equal(result.visibility, 'private');
	assert.equal(result.private, true);
	assert.equal(result.cloneAuthorized, false);
});

test('rejects archived repositories before import mutation', async () => {
	await assertMetadataError(
		() => resolve({ fetchImpl: async () => response(200, metadata({ archived: true })) }),
		'github_repository_archived',
	);
});

test('maps installation, authorization, unavailable, rate-limit, upstream, and network failures without retries', async () => {
	let authorizationCalls = 0;
	await assertMetadataError(
		() => resolveAuthorizedGitHubRepositoryMetadata({ ...reference }, {
			getInstallationToken: async () => {
				authorizationCalls += 1;
				return { token: 'opaque-token', permissions: { metadata: 'read' } };
			},
			fetchImpl: async () => response(401, {}),
		}),
		'github_repository_unauthorized',
	);
	assert.equal(authorizationCalls, 1);

	for (const [status, code] of [
		[401, 'github_repository_unauthorized'],
		[403, 'github_repository_unauthorized'],
		[404, 'github_repository_unavailable'],
		[429, 'github_rate_limited'],
		[500, 'github_bad_response'],
	]) {
		let fetchCalls = 0;
		await assertMetadataError(() => resolve({
			fetchImpl: async () => {
				fetchCalls += 1;
				return response(status, {});
			},
		}), code);
		assert.equal(fetchCalls, 1, `expected no retry for status ${status}`);
	}
	await assertMetadataError(() => resolve({ fetchImpl: async () => { throw new Error('secret transport detail'); } }), 'github_network_error');
});

test('maps installation provider exceptions to a stable secret-free failure', async () => {
	const secret = 'installation-provider-secret';
	try {
		await resolveAuthorizedGitHubRepositoryMetadata({ ...reference }, {
			getInstallationToken: async () => { throw new Error(secret); },
			fetchImpl: async () => response(200, metadata()),
		});
		assert.fail('expected installation failure');
	} catch (error) {
		assert.equal(error instanceof GitHubRepositoryMetadataError, true);
		assert.equal(error.code, 'github_installation_unavailable');
		assert.equal(error.status, 503);
		assert.equal(error.message.includes(secret), false);
		assert.equal(JSON.stringify(error).includes(secret), false);
	}
});

test('rejects malformed transport responses and repository payloads without exposing raw data', async () => {
	await assertMetadataError(() => resolve({ fetchImpl: async () => ({}) }), 'github_bad_response');
	for (const payload of [
		null,
		{},
		metadata({ id: '1294736347' }),
		metadata({ full_name: '../invalid' }),
		metadata({ default_branch: '' }),
		metadata({ private: 'false' }),
	]) {
		await assertMetadataError(() => resolve({ fetchImpl: async () => response(200, payload) }), 'github_bad_response');
	}
});

test('accepts opaque variable-length tokens and never returns or embeds them in errors', async () => {
	for (const token of ['x', 'github_pat_' + 'a'.repeat(240)]) {
		const result = await resolve({ token });
		assert.equal('token' in result, false);
		assert.equal(JSON.stringify(result).includes(token), false);
	}
	const secret = 'do-not-leak-this-token';
	try {
		await resolve({ token: secret, fetchImpl: async () => response(403, { message: secret }) });
		assert.fail('expected authorization failure');
	} catch (error) {
		assert.equal(error instanceof GitHubRepositoryMetadataError, true);
		assert.equal(error.code, 'github_repository_unauthorized');
		assert.equal(error.message.includes(secret), false);
		assert.equal(JSON.stringify(error).includes(secret), false);
	}
});

async function assertMetadataError(operation, code) {
	await assert.rejects(
		operation,
		(error) => error instanceof GitHubRepositoryMetadataError && error.code === code,
	);
}
