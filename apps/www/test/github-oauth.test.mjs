import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('GitHub App manifest conversion stores OAuth credentials for login', async (t) => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bapx-github-oauth-'));
	const previous = {
		configFile: process.env.BAPX_GITHUB_APP_CONFIG_FILE,
		clientId: process.env.GITHUB_CLIENT_ID,
		clientSecret: process.env.GITHUB_CLIENT_SECRET,
		appId: process.env.BAPX_GITHUB_APP_ID,
		privateKey: process.env.BAPX_GITHUB_APP_PRIVATE_KEY,
	};
	t.after(() => {
		fs.rmSync(root, { recursive: true, force: true });
		for (const [key, value] of [
			['BAPX_GITHUB_APP_CONFIG_FILE', previous.configFile],
			['GITHUB_CLIENT_ID', previous.clientId],
			['GITHUB_CLIENT_SECRET', previous.clientSecret],
			['BAPX_GITHUB_APP_ID', previous.appId],
			['BAPX_GITHUB_APP_PRIVATE_KEY', previous.privateKey],
		]) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	});
	const configFile = path.join(root, 'github-app.json');
	process.env.BAPX_GITHUB_APP_CONFIG_FILE = configFile;
	delete process.env.GITHUB_CLIENT_ID;
	delete process.env.GITHUB_CLIENT_SECRET;
	delete process.env.BAPX_GITHUB_APP_ID;
	delete process.env.BAPX_GITHUB_APP_PRIVATE_KEY;

	const moduleUrl = new URL(`../src/server/github-oauth.mjs?test=${Date.now()}`, import.meta.url);
	const {
		exchangeGitHubAppManifestCode,
		githubAppCredentials,
		githubAppManifestRegistration,
	} = await import(moduleUrl.href);

	const registration = githubAppManifestRegistration('bapXai');
	assert.equal(registration.action, 'https://github.com/organizations/bapXai/settings/apps/new');
	assert.equal(registration.manifest.redirect_url, 'https://bapx.in/api/auth/oauth/github/manifest/callback');
	assert.deepEqual(registration.manifest.callback_urls, ['https://bapx.in/api/auth/oauth/github/callback']);
	assert.equal(registration.manifest.request_oauth_on_install, true);

	const exchanged = await exchangeGitHubAppManifestCode('temporary-code', {
		fetchImpl: async (url, init) => {
			assert.equal(url, 'https://api.github.com/app-manifests/temporary-code/conversions');
			assert.equal(init.method, 'POST');
			return {
				ok: true,
				async json() {
					return {
						id: 123456,
						client_id: 'Iv1.client',
						client_secret: 'secret-value',
						pem: '-----BEGIN RSA PRIVATE KEY-----\\nkey\\n-----END RSA PRIVATE KEY-----',
						webhook_secret: 'webhook-secret',
						slug: 'bapx',
						html_url: 'https://github.com/apps/bapx',
					};
				},
			};
		},
	});

	assert.deepEqual(exchanged, {
		appId: '123456',
		clientId: 'Iv1.client',
		slug: 'bapx',
		htmlUrl: 'https://github.com/apps/bapx',
		updatedAt: exchanged.updatedAt,
	});
	assert.match(exchanged.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
	assert.equal(fs.statSync(configFile).mode & 0o777, 0o600);
	assert.equal(githubAppCredentials().clientId, 'Iv1.client');
	assert.equal(githubAppCredentials().clientSecret, 'secret-value');
	assert.equal(githubAppCredentials().appId, '123456');
	assert.match(githubAppCredentials().privateKey, /BEGIN RSA PRIVATE KEY/);
});
