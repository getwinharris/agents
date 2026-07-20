import assert from 'node:assert/strict';
import test from 'node:test';
import {
	GitHubRepositoryMetadataError,
	resolveAuthorizedGitHubRepositoryMetadata,
} from '../src/server/github-repository-metadata.mjs';

function response(payload) {
	return {
		ok: true,
		status: 200,
		async json() { return payload; },
	};
}

function payload(overrides = {}) {
	return {
		id: 1294736347,
		full_name: 'CanonicalOwner/RenamedRepository',
		owner: { type: 'Organization' },
		default_branch: 'main',
		visibility: 'public',
		private: false,
		archived: false,
		...overrides,
	};
}

test('canonicalizes the caller repository after GitHub resolves a renamed repository', async () => {
	const reference = {
		owner: 'submitted-owner',
		repository: 'old-name',
		fullName: 'submitted-owner/old-name',
		httpsUrl: 'https://github.com/submitted-owner/old-name.git',
	};
	const metadata = await resolveAuthorizedGitHubRepositoryMetadata(reference, {
		getInstallationToken: async () => ({ token: 'opaque-token', permissions: { metadata: 'read' } }),
		fetchImpl: async (url) => {
			assert.equal(url, 'https://api.github.com/repos/submitted-owner/old-name');
			return response(payload());
		},
	});

	assert.deepEqual(reference, {
		owner: 'CanonicalOwner',
		repository: 'RenamedRepository',
		fullName: 'CanonicalOwner/RenamedRepository',
		httpsUrl: 'https://github.com/CanonicalOwner/RenamedRepository.git',
	});
	assert.equal(metadata.fullName, 'CanonicalOwner/RenamedRepository');
});

test('rejects an invalid canonical identity from GitHub without mutating the submitted reference', async () => {
	const reference = {
		owner: 'submitted-owner',
		repository: 'old-name',
		fullName: 'submitted-owner/old-name',
		httpsUrl: 'https://github.com/submitted-owner/old-name.git',
	};
	const original = structuredClone(reference);

	await assert.rejects(
		resolveAuthorizedGitHubRepositoryMetadata(reference, {
			getInstallationToken: async () => ({ token: 'opaque-token', permissions: { metadata: 'read' } }),
			fetchImpl: async () => response(payload({ full_name: '../invalid' })),
		}),
		(error) => error instanceof GitHubRepositoryMetadataError && error.code === 'github_bad_response',
	);
	assert.deepEqual(reference, original);
});
