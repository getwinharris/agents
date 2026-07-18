const GITHUB_HOST = 'github.com';
const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9._-]+$/;

export class GitHubRepositoryReferenceError extends Error {
	constructor(code, message) {
		super(message);
		this.name = 'GitHubRepositoryReferenceError';
		this.code = code;
	}
}

function invalid(code, message) {
	throw new GitHubRepositoryReferenceError(code, message);
}

function normalizeIdentity(owner, repository) {
	const cleanRepository = repository.endsWith('.git') ? repository.slice(0, -4) : repository;
	if (!OWNER_PATTERN.test(owner) || owner.includes('--')) {
		invalid('invalid_owner', 'GitHub repository owner is invalid');
	}
	if (!cleanRepository || !REPOSITORY_PATTERN.test(cleanRepository) || cleanRepository === '.' || cleanRepository === '..') {
		invalid('invalid_repository', 'GitHub repository name is invalid');
	}
	return {
		owner,
		repository: cleanRepository,
		fullName: `${owner}/${cleanRepository}`,
		httpsUrl: `https://${GITHUB_HOST}/${owner}/${cleanRepository}.git`,
	};
}

function resolveScpReference(value) {
	const match = value.match(/^([^@\s]+)@([^:\s]+):(.+)$/);
	if (!match) return null;
	const [, user, host, pathValue] = match;
	if (user !== 'git') invalid('embedded_credentials', 'Only the GitHub SSH git user is supported');
	if (host.toLowerCase() !== GITHUB_HOST) invalid('unsupported_host', 'Only github.com repository references are supported');
	if (pathValue.includes('?') || pathValue.includes('#') || pathValue.includes('\\')) {
		invalid('ambiguous_reference', 'GitHub repository reference is ambiguous');
	}
	const segments = pathValue.split('/').filter(Boolean);
	if (segments.length !== 2 || segments.some((segment) => segment === '.' || segment === '..')) {
		invalid('unsupported_path', 'GitHub repository reference must identify exactly owner/repository');
	}
	return normalizeIdentity(segments[0], segments[1]);
}

export function resolveGitHubRepositoryReference(input) {
	if (typeof input !== 'string' || !input.trim()) {
		invalid('invalid_input', 'GitHub repository reference must be a non-empty string');
	}
	const value = input.trim();
	if (/\s/.test(value)) invalid('ambiguous_reference', 'GitHub repository reference cannot contain whitespace');

	const scpIdentity = resolveScpReference(value);
	if (scpIdentity) return scpIdentity;

	let url;
	try {
		url = new URL(value);
	} catch {
		invalid('invalid_url', 'GitHub repository reference must be an HTTPS or SSH URL');
	}

	if (!['https:', 'ssh:'].includes(url.protocol)) {
		invalid('unsupported_protocol', 'Only GitHub HTTPS and SSH repository URLs are supported');
	}
	if (url.hostname.toLowerCase() !== GITHUB_HOST) {
		invalid('unsupported_host', 'Only github.com repository references are supported');
	}
	if (url.password || (url.username && !(url.protocol === 'ssh:' && url.username === 'git'))) {
		invalid('embedded_credentials', 'Repository URLs must not contain credentials');
	}
	if (url.port || url.search || url.hash) {
		invalid('ambiguous_reference', 'GitHub repository URL cannot include a port, query, or fragment');
	}

	const segments = url.pathname.split('/').filter(Boolean);
	if (segments.length !== 2 || segments.some((segment) => segment === '.' || segment === '..')) {
		invalid('unsupported_path', 'GitHub repository URL must identify exactly owner/repository');
	}
	return normalizeIdentity(segments[0], segments[1]);
}
