const GITHUB_PROVIDER_ID = /^[1-9][0-9]*$/;

const AUTHENTICATED = Object.freeze({ ok: true, status: 200, error: null });
const AUTHENTICATION_REQUIRED = Object.freeze({
	ok: false,
	status: 401,
	error: 'authentication_required',
});
const ADMIN_FORBIDDEN = Object.freeze({ ok: false, status: 403, error: 'admin_forbidden' });
const CROSS_ORIGIN_FORBIDDEN = Object.freeze({ ok: false, status: 403, error: 'cross_origin_forbidden' });

function createAuthorization(valid, entries = []) {
	const ids = new Set(entries);
	return Object.freeze({
		valid,
		size: ids.size,
		hasGithubUserId(id) {
			return valid && typeof id === 'string' && ids.has(id);
		},
	});
}

export function parseAdminGithubUserIds(value) {
	const raw = String(value ?? '').trim();
	if (!raw) return createAuthorization(false);
	const entries = raw.split(',').map((entry) => entry.trim());
	if (entries.some((entry) => !GITHUB_PROVIDER_ID.test(entry))) {
		return createAuthorization(false);
	}
	return createAuthorization(true, entries);
}

export function isAuthorizedAdminAccount(account, authorization) {
	if (!authorization?.valid || typeof authorization.hasGithubUserId !== 'function') return false;
	if (!account || !Array.isArray(account.providers)) return false;
	return account.providers.some(
		(provider) =>
			provider?.name === 'github' &&
			typeof provider.id === 'string' &&
			authorization.hasGithubUserId(provider.id),
	);
}

export function authorizeAdminRequest(account, authorization) {
	if (!account) return AUTHENTICATION_REQUIRED;
	if (!isAuthorizedAdminAccount(account, authorization)) return ADMIN_FORBIDDEN;
	return AUTHENTICATED;
}

export function isSameOriginAdminRequest(origin, host) {
	if (!origin) return false;
	try {
		const parsed = new URL(origin);
		return parsed.protocol === 'https:' && parsed.host === host;
	} catch {
		return false;
	}
}

export function authorizeAdminApiRequest(account, authorization, { mutation = false, origin, host } = {}) {
	const decision = authorizeAdminRequest(account, authorization);
	if (!decision.ok) return decision;
	if (mutation && !isSameOriginAdminRequest(origin, host)) return CROSS_ORIGIN_FORBIDDEN;
	return AUTHENTICATED;
}
