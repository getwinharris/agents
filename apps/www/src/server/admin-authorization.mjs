const GITHUB_PROVIDER_ID = /^[1-9][0-9]*$/;

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
