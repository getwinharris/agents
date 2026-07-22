import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const callbackUrl = process.env.GITHUB_OAUTH_CALLBACK_URL || 'https://bapx.in/api/auth/oauth/github/callback';
const manifestCallbackUrl = process.env.GITHUB_APP_MANIFEST_CALLBACK_URL || 'https://bapx.in/api/auth/oauth/github/manifest/callback';
const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'bapX', 'X-GitHub-Api-Version': '2022-11-28' };
const defaultAppOwner = process.env.GITHUB_APP_MANIFEST_OWNER || 'bapXai';
const dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = process.env.WORKSPACE_ROOT || path.resolve(dirname, '../../../..');
const appConfigFile = process.env.BAPX_GITHUB_APP_CONFIG_FILE || path.join(workspaceRoot, 'data', 'platform', 'secrets', 'github-app.json');

function readStoredAppConfig() {
	try {
		const stored = JSON.parse(fs.readFileSync(appConfigFile, 'utf8'));
		if (stored?.schemaVersion !== 1) return {};
		return stored;
	} catch {
		return {};
	}
}

function writeStoredAppConfig(config) {
	fs.mkdirSync(path.dirname(appConfigFile), { recursive: true });
	const temporary = `${appConfigFile}.${process.pid}.tmp`;
	fs.writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
	fs.renameSync(temporary, appConfigFile);
}

export function githubAppCredentials() {
	const stored = readStoredAppConfig();
	return {
		clientId: process.env.GITHUB_CLIENT_ID || stored.clientId,
		clientSecret: process.env.GITHUB_CLIENT_SECRET || stored.clientSecret,
		appId: process.env.BAPX_GITHUB_APP_ID || stored.appId,
		privateKey: process.env.BAPX_GITHUB_APP_PRIVATE_KEY || stored.privateKey,
		webhookSecret: process.env.GITHUB_WEBHOOK_SECRET || stored.webhookSecret,
		installationId: process.env.BAPX_GITHUB_INSTALLATION_ID || stored.installationId,
	};
}

function githubAppManifest() {
	return {
		name: process.env.GITHUB_APP_MANIFEST_NAME || 'bapX',
		url: 'https://bapx.in',
		hook_attributes: {
			url: 'https://bapx.in/api/channels/github/webhook',
			active: true,
		},
		redirect_url: manifestCallbackUrl,
		callback_urls: [callbackUrl],
		request_oauth_on_install: true,
		public: false,
		default_permissions: {
			metadata: 'read',
			administration: 'write',
			contents: 'write',
			issues: 'write',
			members: 'write',
			organization_projects: 'write',
			pull_requests: 'write',
			repository_projects: 'write',
			workflows: 'write',
		},
		default_events: [
			'membership',
			'organization',
			'project',
			'project_card',
			'project_column',
			'push',
			'pull_request',
			'repository',
			'team',
			'issues',
		],
	};
}

export function githubAppManifestRegistration(owner = defaultAppOwner) {
	const cleanOwner = String(owner || defaultAppOwner).trim();
	if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(cleanOwner)) throw new Error('GitHub App owner is invalid');
	return {
		action: `https://github.com/organizations/${cleanOwner}/settings/apps/new`,
		manifest: githubAppManifest(),
	};
}

export function githubAuthorization() {
	const credentials = githubAppCredentials();
	if (!credentials.clientId) throw new Error('GitHub login is not configured');
	const state = crypto.randomBytes(32).toString('base64url');
	const url = new URL('https://github.com/login/oauth/authorize');
	for (const [key, value] of Object.entries({ client_id: credentials.clientId, redirect_uri: callbackUrl, scope: 'read:user user:email', state })) url.searchParams.set(key, value);
	return { state, url: url.href };
}

async function json(url, options, fetchImpl = globalThis.fetch) {
	const response = await fetchImpl(url, options);
	const data = await response.json().catch(() => ({}));
	if (!response.ok) throw new Error(data.error_description || data.message || 'GitHub login failed');
	return data;
}

export async function githubIdentity(code) {
	const credentials = githubAppCredentials();
	if (!code || !credentials.clientId || !credentials.clientSecret) throw new Error('GitHub login is not configured');
	const token = await json('https://github.com/login/oauth/access_token', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: credentials.clientId, client_secret: credentials.clientSecret, code, redirect_uri: callbackUrl }) });
	const authorized = { ...headers, Authorization: `Bearer ${token.access_token}` };
	const [user, emails] = await Promise.all([json('https://api.github.com/user', { headers: authorized }), json('https://api.github.com/user/emails', { headers: authorized })]);
	const email = emails.find((item) => item.primary && item.verified)?.email || emails.find((item) => item.verified)?.email;
	if (!email) throw new Error('GitHub must provide a verified email address');
	return { id: String(user.id), login: user.login, name: user.name || user.login, email };
}

export async function exchangeGitHubAppManifestCode(code, { fetchImpl = globalThis.fetch } = {}) {
	const cleanCode = String(code || '').trim();
	if (!cleanCode) throw new Error('GitHub App manifest code is missing');
	if (typeof fetchImpl !== 'function') throw new Error('GitHub App manifest exchange is unavailable');
	const app = await json(`https://api.github.com/app-manifests/${encodeURIComponent(cleanCode)}/conversions`, {
		method: 'POST',
		headers,
	}, fetchImpl);
	const clientId = String(app.client_id || '').trim();
	const clientSecret = String(app.client_secret || '').trim();
	const appId = String(app.id || '').trim();
	const privateKey = String(app.pem || '').trim();
	if (!clientId || !clientSecret || !/^[1-9]\d*$/.test(appId) || !privateKey) {
		throw new Error('GitHub App manifest conversion did not return usable credentials');
	}
	const config = {
		schemaVersion: 1,
		appId,
		clientId,
		clientSecret,
		privateKey,
		webhookSecret: String(app.webhook_secret || '').trim(),
		slug: String(app.slug || '').trim(),
		htmlUrl: String(app.html_url || '').trim(),
		updatedAt: new Date().toISOString(),
	};
	writeStoredAppConfig(config);
	return {
		appId: config.appId,
		clientId: config.clientId,
		slug: config.slug,
		htmlUrl: config.htmlUrl,
		updatedAt: config.updatedAt,
	};
}
