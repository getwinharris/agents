import { resolveGitHubRepositoryReference } from './github-repository.mjs';

const GITHUB_API_ORIGIN = 'https://api.github.com';
const GITHUB_METADATA_TIMEOUT_MS = 10_000;

export class GitHubRepositoryMetadataError extends Error {
	constructor(code, message, status = 502) {
		super(message);
		this.name = 'GitHubRepositoryMetadataError';
		this.code = code;
		this.status = status;
	}
}

function fail(code, message, status) {
	throw new GitHubRepositoryMetadataError(code, message, status);
}

function normalizeIdentity(reference) {
	if (!reference || typeof reference !== 'object' || Array.isArray(reference)) {
		fail('github_bad_response', 'GitHub repository identity is unavailable');
	}
	const owner = String(reference.owner || '').trim();
	const repository = String(reference.repository || '').trim();
	const fullName = String(reference.fullName || `${owner}/${repository}`).trim();
	if (!owner || !repository || fullName.toLowerCase() !== `${owner}/${repository}`.toLowerCase()) {
		fail('github_bad_response', 'GitHub repository identity is unavailable');
	}
	return { owner, repository, fullName };
}

function normalizeTokenContext(value) {
	if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.token !== 'string' || !value.token) {
		fail('github_installation_unavailable', 'GitHub App installation authorization is unavailable', 503);
	}
	return {
		token: value.token,
		contents: ['read', 'write'].includes(value.permissions?.contents),
	};
}

function mapUpstreamFailure(status) {
	if (status === 401 || status === 403) {
		fail('github_repository_unauthorized', 'GitHub repository authorization failed', 403);
	}
	if (status === 404) {
		fail('github_repository_unavailable', 'GitHub repository is unavailable', 404);
	}
	if (status === 429) {
		fail('github_rate_limited', 'GitHub repository metadata is temporarily rate limited', 429);
	}
	if (status >= 500) {
		fail('github_bad_response', 'GitHub repository metadata is temporarily unavailable', 502);
	}
	fail('github_bad_response', 'GitHub repository metadata request failed', 502);
}

function canonicalRepositoryReference(fullName) {
	try {
		return resolveGitHubRepositoryReference(`https://github.com/${fullName}`);
	} catch {
		fail('github_bad_response', 'GitHub returned invalid repository metadata');
	}
}

function normalizePayload(payload, cloneAuthorized) {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		fail('github_bad_response', 'GitHub returned invalid repository metadata');
	}
	const id = payload.id;
	const fullName = typeof payload.full_name === 'string' ? payload.full_name.trim() : '';
	const ownerType = typeof payload.owner?.type === 'string' ? payload.owner.type.trim() : '';
	const defaultBranch = typeof payload.default_branch === 'string' ? payload.default_branch.trim() : '';
	const isPrivate = payload.private;
	const archived = payload.archived;
	const visibility = typeof payload.visibility === 'string'
		? payload.visibility.trim().toLowerCase()
		: isPrivate === true ? 'private' : isPrivate === false ? 'public' : '';
	const repository = fullName ? canonicalRepositoryReference(fullName) : null;

	if (
		!Number.isSafeInteger(id) || id <= 0 ||
		!repository || !ownerType || !defaultBranch ||
		typeof isPrivate !== 'boolean' ||
		typeof archived !== 'boolean' ||
		!['public', 'private', 'internal'].includes(visibility)
	) {
		fail('github_bad_response', 'GitHub returned invalid repository metadata');
	}

	if (archived) {
		fail('github_repository_archived', 'Archived GitHub repositories cannot be imported', 422);
	}

	return {
		repository,
		metadata: {
			repositoryId: id,
			fullName: repository.fullName,
			ownerType,
			defaultBranch,
			visibility,
			private: isPrivate,
			archived,
			cloneAuthorized,
			status: 'resolved',
		},
	};
}

export async function resolveAuthorizedGitHubRepositoryMetadata(
	reference,
	{ getInstallationToken, fetchImpl = globalThis.fetch } = {},
) {
	const identity = normalizeIdentity(reference);
	if (typeof getInstallationToken !== 'function') {
		fail('github_installation_unavailable', 'GitHub App installation authorization is unavailable', 503);
	}
	if (typeof fetchImpl !== 'function') {
		fail('github_network_error', 'GitHub repository metadata transport is unavailable', 503);
	}

	let tokenContext;
	try {
		tokenContext = normalizeTokenContext(await getInstallationToken({
			repository: identity,
			permissions: { metadata: 'read' },
		}));
	} catch {
		fail('github_installation_unavailable', 'GitHub App installation authorization is unavailable', 503);
	}

	let response;
	try {
		response = await fetchImpl(
			`${GITHUB_API_ORIGIN}/repos/${encodeURIComponent(identity.owner)}/${encodeURIComponent(identity.repository)}`,
			{
				method: 'GET',
				headers: {
					Accept: 'application/vnd.github+json',
					Authorization: `Bearer ${tokenContext.token}`,
					'X-GitHub-Api-Version': '2022-11-28',
				},
				signal: AbortSignal.timeout(GITHUB_METADATA_TIMEOUT_MS),
			},
		);
	} catch {
		fail('github_network_error', 'GitHub repository metadata request failed', 503);
	}

	if (!response || typeof response.ok !== 'boolean' || !Number.isInteger(response.status)) {
		fail('github_bad_response', 'GitHub repository metadata response is invalid');
	}
	if (!response.ok) mapUpstreamFailure(response.status);

	let payload;
	try {
		payload = await response.json();
	} catch {
		fail('github_bad_response', 'GitHub returned invalid repository metadata');
	}
	const resolved = normalizePayload(payload, tokenContext.contents);
	Object.assign(reference, resolved.repository);
	return resolved.metadata;
}
