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

function isTraversalSegment(segment) {
	try {
		const decoded = decodeURIComponent(segment);
		return decoded === '.' || decoded === '..';
	} catch {
		invalid('ambiguous_reference', 'GitHub repository reference contains invalid encoding');
	}
}

function parseExactPath(pathValue, message) {
	if (!pathValue || pathValue.startsWith('/') || pathValue.endsWith('/') || pathValue.includes('//')) {
		invalid('unsupported_path', message);
	}
	const segments = pathValue.split('/');
	if (segments.length !== 2 || segments.some((segment) => !segment || isTraversalSegment(segment))) {
		invalid('unsupported_path', message);
	}
	return segments;
}

function resolveScpReference(value) {
	if (value.includes('://')) return null;
	const match = value.match(/^([^@\s]+)@([^:\s]+):(.+)$/);
	if (!match) return null;
	const [, user, host, pathValue] = match;
	if (user !== 'git') invalid('embedded_credentials', 'Only the GitHub SSH git user is supported');
	if (host.toLowerCase() !== GITHUB_HOST) invalid('unsupported_host', 'Only github.com repository references are supported');
	if (pathValue.includes('?') || pathValue.includes('#') || pathValue.includes('\\')) {
		invalid('ambiguous_reference', 'GitHub repository reference is ambiguous');
	}
	const segments = parseExactPath(
		pathValue,
		'GitHub repository reference must identify exactly owner/repository',
	);
	return normalizeIdentity(segments[0], segments[1]);
}

function inspectRawUrl(value) {
	const match = value.match(/^([A-Za-z][A-Za-z0-9+.-]*):\/\/([^/]*)(\/.*)?$/);
	if (!match) return null;
	const [, rawProtocol, authority, rawPath = ''] = match;
	const protocol = rawProtocol.toLowerCase();
	if (!['https', 'ssh'].includes(protocol)) return { protocol, authority, rawPath };

	if (authority.includes(':')) {
		invalid('ambiguous_reference', 'GitHub repository URL cannot include a port, query, or fragment');
	}
	if (protocol === 'ssh' && authority.toLowerCase() !== `git@${GITHUB_HOST}`) {
		if (authority.toLowerCase() === GITHUB_HOST || authority.toLowerCase().endsWith(`@${GITHUB_HOST}`)) {
			invalid('embedded_credentials', 'Only the GitHub SSH git user is supported');
		}
	}

	const rawPathWithoutPrefix = rawPath.startsWith('/') ? rawPath.slice(1) : rawPath;
	if (!rawPath.startsWith('/') || rawPathWithoutPrefix.includes('//') || rawPathWithoutPrefix.endsWith('/')) {
		invalid('unsupported_path', 'GitHub repository URL must identify exactly owner/repository');
	}
	return { protocol, authority, rawPath };
}

export function resolveGitHubRepositoryReference(input) {
	if (typeof input !== 'string' || !input.trim()) {
		invalid('invalid_input', 'GitHub repository reference must be a non-empty string');
	}
	const value = input.trim();
	if (/\s/.test(value)) invalid('ambiguous_reference', 'GitHub repository reference cannot contain whitespace');

	const scpIdentity = resolveScpReference(value);
	if (scpIdentity) return scpIdentity;

	const rawUrl = inspectRawUrl(value);
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
	if (url.protocol === 'ssh:' && url.username !== 'git') {
		invalid('embedded_credentials', 'Only the GitHub SSH git user is supported');
	}
	if (url.port || url.search || url.hash) {
		invalid('ambiguous_reference', 'GitHub repository URL cannot include a port, query, or fragment');
	}

	const rawPath = rawUrl?.rawPath ?? url.pathname;
	const pathValue = rawPath.startsWith('/') ? rawPath.slice(1) : rawPath;
	const segments = parseExactPath(pathValue, 'GitHub repository URL must identify exactly owner/repository');
	return normalizeIdentity(segments[0], segments[1]);
}
