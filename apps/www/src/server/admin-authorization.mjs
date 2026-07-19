const GITHUB_PROVIDER_ID = /^[1-9][0-9]*$/;

export function parseAdminGithubUserIds(value) {
	const raw = String(value ?? '').trim();
	if (!raw) return { valid: false, ids: new Set() };
	const entries = raw.split(',').map((entry) => entry.trim());
	if (entries.some((entry) => !GITHUB_PROVIDER_ID.test(entry))) {
		return { valid: false, ids: new Set() };
	}
	return { valid: true, ids: new Set(entries) };
}

export function isAuthorizedAdminAccount(account, authorization) {
	if (!authorization?.valid || !(authorization.ids instanceof Set)) return false;
	if (!account || !Array.isArray(account.providers)) return false;
	return account.providers.some(
		(provider) =>
			provider?.name === 'github' &&
			typeof provider.id === 'string' &&
			authorization.ids.has(provider.id),
	);
}
