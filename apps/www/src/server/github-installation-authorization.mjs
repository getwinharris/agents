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
	const parsed = Number.parseInt(String(value || ''), 10);
	if (!Number.isSafeInteger(parsed) || parsed <= 0) unavailable();
	return parsed;
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

function normalizeTokenPayload(payload) {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) unavailable();
	const token = typeof payload.token === 'string' ? payload.token : '';
	const expiresAt = Date.parse(payload.expires_at);
	if (!token || !Number.isFinite(expiresAt)) unavailable();
	return {
		token,
		expiresAt,
		permissions: {
			metadata: payload.permissions?.metadata === 'read' ? 'read' : undefined,
			contents: ['read', 'write'].includes(payload.permissions?.contents) ? payload.permissions.contents : undefined,
		},
	};
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
	let cached;

	return async function getInstallationToken() {
		const nowMs = now();
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
				body: JSON.stringify({ permissions: { metadata: 'read', contents: 'read' } }),
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
		cached = normalizeTokenPayload(payload);
		return { token: cached.token, permissions: cached.permissions };
	};
}
