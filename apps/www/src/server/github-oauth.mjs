import crypto from 'node:crypto';

const callbackUrl = process.env.GITHUB_OAUTH_CALLBACK_URL || 'https://bapx.in/api/auth/oauth/github/callback';
const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'bapX', 'X-GitHub-Api-Version': '2022-11-28' };

export function githubAuthorization() {
	if (!process.env.GITHUB_CLIENT_ID) throw new Error('GitHub login is not configured');
	const state = crypto.randomBytes(32).toString('base64url');
	const url = new URL('https://github.com/login/oauth/authorize');
	for (const [key, value] of Object.entries({ client_id: process.env.GITHUB_CLIENT_ID, redirect_uri: callbackUrl, scope: 'read:user user:email', state })) url.searchParams.set(key, value);
	return { state, url: url.href };
}

async function json(url, options) {
	const response = await fetch(url, options);
	const data = await response.json().catch(() => ({}));
	if (!response.ok) throw new Error(data.error_description || data.message || 'GitHub login failed');
	return data;
}

export async function githubIdentity(code) {
	if (!code || !process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) throw new Error('GitHub login is not configured');
	const token = await json('https://github.com/login/oauth/access_token', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: process.env.GITHUB_CLIENT_ID, client_secret: process.env.GITHUB_CLIENT_SECRET, code, redirect_uri: callbackUrl }) });
	const authorized = { ...headers, Authorization: `Bearer ${token.access_token}` };
	const [user, emails] = await Promise.all([json('https://api.github.com/user', { headers: authorized }), json('https://api.github.com/user/emails', { headers: authorized })]);
	const email = emails.find((item) => item.primary && item.verified)?.email || emails.find((item) => item.verified)?.email;
	if (!email) throw new Error('GitHub must provide a verified email address');
	return { id: String(user.id), login: user.login, name: user.name || user.login, email };
}
