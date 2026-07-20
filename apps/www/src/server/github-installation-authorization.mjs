import { createSign } from 'node:crypto';

const GITHUB_API_ORIGIN = 'https://api.github.com';
const TOKEN_REFRESH_SKEW_MS = 60_000;
const REQUEST_TIMEOUT_MS = 10_000;

export class GitHubInstallationAuthorizationError extends Error {
	constructor(code = 'github_installation_unavailable') {
		super('GitHub App installation authorization is unavailable');
		this.name = 'GitHubInstallationAuthorizationError';
		this.code = code;
		this.status = 503;
	}
}

function unavailable() {
	throw new GitHubInstallationAuthorizationError();
}

function requiredPositiveInteger(value) {
	const normalized = String(value ?? '').trim();
	if (!/^[1-9]\d*$/.test(normalized)) unavailable();
	const parsed = Number(normalized);
	if (!Number.isSafeInteger(parsed)) unavailable();
	return parsed;
}

function normalizeRequestedPermissions(value) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) unavailable();
	const keys = Object.keys(value).sort();
	if (!keys.length || keys.some((key) => !['contents', 'metadata'].includes(key))) unavailable();
	if (value.metadata !== 'read') unavailable();
	if ('contents' in value && value.contents !== 'read') unavailable();
	const permissions = { metadata: 'read' };
	if (value.contents === 'read') permissions.contents = 'read';
	return permissions;
}

function permissionCacheKey(permissions) {
	return permissions.contents === 'read' ? 'metadata:read|contents:read' : 'metadata:read';
}

function base64url(value) {
	return Buffer.from(value).toString('base64url');
}

function createAppJwt(appId, privateKey, nowMs) {
	const now = Math.floor(nowMs / 1000);
	const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
	const payload = base64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: String(appId) }));
	const unsigned = `${header}.${payload}`;
	try {
		const signer = createSign('RSA-SHA256');
		signer.update(unsigned);
		signer.end();
		return `${unsigned}.${signer.sign(privateKey, 'base64url')}`;
	} catch {
		unavailable();
	}
}

function normalizeTokenPayload(payload, requestedPermissions) {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) unavailable();
	const token = typeof payload.token === 'string' ? payload.token : '';
	const expiresAt = Date.parse(payload.expires_at);
	if (!token || !Number.isFinite(expiresAt)) unavailable();
	if (payload.permissions?.metadata !== requestedPermissions.metadata) unavailable();
	const returnedContents = payload.permissions?.contents;
	if (requestedPermissions.contents === 'read') {
		if (returnedContents !== 'read') unavailable();
	} else if (returnedContents !== undefined) {
		unavailable();
	}
	return { token, expiresAt, permissions: requestedPermissions };
}

export function createGitHubInstallationAuthorizationProvider({
	appId = process.env.BAPX_GITHUB_APP_ID,
	installationId = process.env.BAPX_GITHUB_INSTALLATION_ID,
	privateKey = process.env.BAPX_GITHUB_APP_PRIVATE_KEY,
	fetchImpl = globalThis.fetch,
	now = () => Date.now(),
} = {}) {
	const normalizedAppId = requiredPositiveInteger(appId);
	const normalizedInstallationId = requiredPositiveInteger(installationId);
	const normalizedPrivateKey = String(privateKey || '').replace(/\\n/g, '\n').trim();
	if (!normalizedPrivateKey || typeof fetchImpl !== 'function') unavailable();
	const cachedByPermissions = new Map();

	return async function getInstallationToken({ permissions } = {}) {
		const requestedPermissions = normalizeRequestedPermissions(permissions);
		const cacheKey = permissionCacheKey(requestedPermissions);
		const nowMs = now();
		const cached = cachedByPermissions.get(cacheKey);
		if (cached && cached.expiresAt - TOKEN_REFRESH_SKEW_MS > nowMs) {
			return { token: cached.token, permissions: cached.permissions };
		}

		const jwt = createAppJwt(normalizedAppId, normalizedPrivateKey, nowMs);
		let response;
		try {
			response = await fetchImpl(`${GITHUB_API_ORIGIN}/app/installations/${normalizedInstallationId}/access_tokens`, {
				method: 'POST',
				headers: {
					Accept: 'application/vnd.github+json',
					Authorization: `Bearer ${jwt}`,
					'X-GitHub-Api-Version': '2022-11-28',
				},
				body: JSON.stringify({ permissions: requestedPermissions }),
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			});
		} catch {
			unavailable();
		}
		if (!response?.ok) unavailable();
		let payload;
		try {
			payload = await response.json();
		} catch {
			unavailable();
		}
		const normalized = normalizeTokenPayload(payload, requestedPermissions);
		cachedByPermissions.set(cacheKey, normalized);
		return { token: normalized.token, permissions: normalized.permissions };
	};
}
