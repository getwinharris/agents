import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPlatformStore, customerBusinessWorkspaceRoot } from './src/server/platform-store.mjs';
import { exchangeGitHubAppManifestCode, githubAppCredentials, githubAppManifestRegistration, githubAuthorization, githubIdentity } from './src/server/github-oauth.mjs';
import { authorizeAdminApiRequest, authorizeAdminRequest, parseAdminGithubUserIds } from './src/server/admin-authorization.mjs';
import { GitHubProjectImportError, importPublicGitHubProject, listGitHubProjects } from './src/server/github-project-import.mjs';
import { resolveGitHubRepositoryReference } from './src/server/github-repository.mjs';
import { resolveAuthorizedGitHubRepository } from './src/server/github-repository-metadata.mjs';
import { createGitHubInstallationAuthorizationProvider } from './src/server/github-installation-authorization.mjs';
import { bearerToken, createApiKeyStore, proxyToApiPlane } from './src/server/api-gateway.mjs';
import { createConnectorStore } from './src/server/connector-store.mjs';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dirname, 'dist');
const port = parseInt(process.env.PORT || '3002', 10);
const dataDir = path.resolve(dirname, 'data');
const postsFile = path.join(dataDir, 'posts.json');
const workspaceRoot = process.env.WORKSPACE_ROOT || path.resolve(dirname, '../../..');
const githubCliBootstrapFile = process.env.BAPX_GITHUB_CLI_BOOTSTRAP_FILE || path.join(workspaceRoot, 'data', 'platform', 'secrets', 'github-cli-bootstrap.json');
const platformStore = createPlatformStore({ workspaceRoot });
const adminAuthorization = parseAdminGithubUserIds(process.env.BAPX_ADMIN_GITHUB_USER_IDS);
const agentsRuntimeOrigin = new URL(process.env.AGENTS_RUNTIME_ORIGIN || 'http://127.0.0.1:3003');
const apiKeyStore = createApiKeyStore({ workspaceRoot });
const connectorStore = createConnectorStore({ workspaceRoot });
const apiPlaneOrigin = process.env.BAPX_API_PLANE_ORIGIN || 'http://127.0.0.1:20130';
const apiPlaneToken = process.env.BAPX_API_PLANE_TOKEN || '';
let githubInstallationTokenProvider;

const HOST_PREFIX = {
	'bapx.in': '',
	'www.bapx.in': '',
	'blogs.bapx.in': '/blogs',
	'mediahub.bapx.in': '/mediahub',
	'agents.bapx.in': '/agents',
	'admin.bapx.in': '/admin',
	'platform.bapx.in': '/platform',
	'docs.bapx.in': '/docs',
};

const MIME = {
	'.html': 'text/html',
	'.js': 'text/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.ico': 'image/x-icon',
	'.woff2': 'font/woff2',
	'.woff': 'font/woff',
	'.md': 'text/markdown; charset=utf-8',
};

const ALLOWED_EXTENSIONS = ['.md', '.mdx', '.mmd', '.json', '.ts', '.astro', '.css', '.mjs', '.yaml', '.yml', '.toml'];

function resolveSafePath(filePath, scopeRoot = workspaceRoot) {
	const rootPath = path.resolve(scopeRoot);
	const resolved = path.resolve(rootPath, filePath);
	if (resolved !== rootPath && !resolved.startsWith(`${rootPath}${path.sep}`)) return null;
	return resolved;
}

function buildFileTree(dir, basePath = '') {
	const items = [];
	try {
		const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => {
			if (a.isDirectory() && !b.isDirectory()) return -1;
			if (!a.isDirectory() && b.isDirectory()) return 1;
			return a.name.localeCompare(b.name);
		});
		for (const entry of entries) {
			if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
			const relPath = basePath ? `${basePath}/${entry.name}` : entry.name;
			if (entry.isDirectory()) items.push({ type: 'directory', name: entry.name, path: relPath });
			else {
				const ext = path.extname(entry.name);
				if (ALLOWED_EXTENSIONS.includes(ext)) items.push({ type: 'file', name: entry.name, path: relPath, ext });
			}
		}
	} catch {}
	return items;
}

function readPosts() {
	try {
		const raw = fs.readFileSync(postsFile, 'utf-8');
		const data = JSON.parse(raw);
		return Array.isArray(data.posts) ? data.posts : [];
	} catch {
		return [];
	}
}

function writePosts(posts) {
	fs.mkdirSync(dataDir, { recursive: true });
	fs.writeFileSync(postsFile, JSON.stringify({ posts }, null, 2), 'utf-8');
}

function jsonResponse(res, status, data) {
	res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
	res.end(JSON.stringify(data));
}

function parseBody(req) {
	return new Promise((resolve, reject) => {
		let body = '';
		req.on('data', (chunk) => { body += chunk; });
		req.on('end', () => {
			try {
				const type = req.headers['content-type'] || '';
				if (type.includes('application/x-www-form-urlencoded')) resolve(Object.fromEntries(new URLSearchParams(body)));
				else resolve(JSON.parse(body));
			} catch {
				reject(new Error('Invalid JSON'));
			}
		});
		req.on('error', reject);
	});
}

function redirect(res, location) {
	res.writeHead(303, { Location: location });
	res.end();
}

function htmlEscape(value) {
	return String(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

function adminHandoffResponse(res, handoff, returnTo) {
	const nonce = crypto.randomBytes(18).toString('base64url');
	const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Opening Admin | bapX</title></head><body><main><p>Opening bapX Admin…</p><form id="admin-handoff" method="post" action="https://admin.bapx.in/api/auth/admin/handoff"><input type="hidden" name="token" value="${htmlEscape(handoff.token)}"><input type="hidden" name="returnTo" value="${htmlEscape(returnTo)}"><button type="submit">Continue to Admin</button></form></main><script nonce="${nonce}">document.getElementById('admin-handoff').requestSubmit()</script></body></html>`;
	res.writeHead(200, {
		'Content-Type': 'text/html; charset=utf-8',
		'Cache-Control': 'no-store',
		'Referrer-Policy': 'no-referrer',
		'Content-Security-Policy': `default-src 'none'; form-action https://admin.bapx.in; script-src 'nonce-${nonce}'`,
		'X-Content-Type-Options': 'nosniff',
	});
	res.end(body);
}

function githubAppManifestResponse(res, registration) {
	const nonce = crypto.randomBytes(18).toString('base64url');
	const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Create bapX GitHub App</title></head><body><main><p>Opening GitHub App setup…</p><form id="github-app-manifest" method="post" action="${htmlEscape(registration.action)}"><input type="hidden" name="manifest" value="${htmlEscape(JSON.stringify(registration.manifest))}"><button type="submit">Continue to GitHub</button></form></main><script nonce="${nonce}">document.getElementById('github-app-manifest').requestSubmit()</script></body></html>`;
	res.writeHead(200, {
		'Content-Type': 'text/html; charset=utf-8',
		'Cache-Control': 'no-store',
		'Referrer-Policy': 'no-referrer',
		'Content-Security-Policy': `default-src 'none'; form-action https://github.com; script-src 'nonce-${nonce}'`,
		'X-Content-Type-Options': 'nosniff',
	});
	res.end(body);
}

function githubAppManifestConfiguredResponse(res, app) {
	const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>GitHub configured | bapX</title><meta http-equiv="refresh" content="2;url=https://bapx.in/login/"></head><body><main><p>bapX GitHub App configured.</p><p>App ID ${htmlEscape(app.appId)} is ready for OAuth login.</p><p><a href="https://bapx.in/login/">Continue to login</a></p></main></body></html>`;
	res.writeHead(200, {
		'Content-Type': 'text/html; charset=utf-8',
		'Cache-Control': 'no-store',
		'Referrer-Policy': 'no-referrer',
		'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'",
		'X-Content-Type-Options': 'nosniff',
	});
	res.end(body);
}

function sessionCookieAttributes(host, maxAge = 34_560_000) {
	const attributes = ['Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax', `Max-Age=${maxAge}`];
	if (host === 'bapx.in' || host.endsWith('.bapx.in')) attributes.splice(1, 0, 'Domain=.bapx.in');
	return attributes.join('; ');
}

function setSessionCookie(res, token, host = 'bapx.in') {
	res.setHeader('Set-Cookie', `bapx_session=${token}; ${sessionCookieAttributes(host)}`);
}

function clearSessionCookie(res, host = 'bapx.in') {
	const cookies = [`bapx_session=; ${sessionCookieAttributes(host, 0)}`];
	if (host === 'bapx.in' || host.endsWith('.bapx.in')) {
		cookies.push(`bapx_session=; ${sessionCookieAttributes('', 0)}`);
	}
	res.setHeader('Set-Cookie', cookies);
}

function getCookieValues(req, name) {
	return String(req.headers.cookie || '')
		.split(';')
		.map((part) => part.trim())
		.filter((part) => part.startsWith(`${name}=`))
		.map((part) => part.slice(name.length + 1));
}

function getCookie(req, name) {
	return getCookieValues(req, name).at(-1);
}

function getSession(req) {
	for (const token of getCookieValues(req, 'bapx_session').toReversed()) {
		const account = platformStore.getSessionAccount(token);
		if (account) return { token, account };
	}
	return { token: undefined, account: null };
}

function getSessionAccount(req) {
	return getSession(req).account;
}

function consumeGitHubCliBootstrap(token) {
	const supplied = String(token || '').trim();
	if (!supplied) throw new Error('GitHub CLI bootstrap token is missing');
	let bootstrap;
	try {
		bootstrap = JSON.parse(fs.readFileSync(githubCliBootstrapFile, 'utf8'));
	} catch {
		throw new Error('GitHub login is not configured');
	}
	if (bootstrap?.schemaVersion !== 1) throw new Error('GitHub CLI bootstrap is invalid');
	if (new Date(String(bootstrap.expiresAt || '')).getTime() <= Date.now()) {
		fs.rmSync(githubCliBootstrapFile, { force: true });
		throw new Error('GitHub CLI bootstrap expired');
	}
	const expected = Buffer.from(String(bootstrap.tokenHash || ''), 'hex');
	const actual = Buffer.from(crypto.createHash('sha256').update(supplied).digest('hex'), 'hex');
	if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
		throw new Error('GitHub CLI bootstrap token is invalid');
	}
	const profile = bootstrap.profile || {};
	const providerId = String(profile.id || '');
	if (!adminAuthorization.hasGithubUserId(providerId)) throw new Error('GitHub CLI bootstrap user is not an authorized admin');
	fs.rmSync(githubCliBootstrapFile, { force: true });
	return {
		id: providerId,
		login: String(profile.login || ''),
		name: String(profile.name || profile.login || ''),
		email: String(profile.email || `${providerId}+${profile.login || 'github'}@users.noreply.github.com`),
	};
}

function authorizeAdminApi(req, res, account, host, mutation = false) {
	const decision = authorizeAdminApiRequest(account, adminAuthorization, {
		mutation,
		origin: req.headers.origin,
		host,
	});
	if (!decision.ok) {
		jsonResponse(res, decision.status, { error: decision.error });
		return false;
	}
	return true;
}

function getGitHubInstallationToken(options) {
	if (!githubInstallationTokenProvider) {
		const credentials = githubAppCredentials();
		githubInstallationTokenProvider = createGitHubInstallationAuthorizationProvider({
			appId: credentials.appId,
			installationId: credentials.installationId,
			privateKey: credentials.privateKey,
		});
	}
	return githubInstallationTokenProvider(options);
}

function suggestedProjectSlug(reference) {
	return `${reference.owner}-${reference.repository}`
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function safeReturnTo(value) {
	if (!value) return null;
	try {
		const target = new URL(value);
		if (target.protocol !== 'https:' || target.username || target.password) return null;
		if (!['admin.bapx.in', 'agents.bapx.in', 'platform.bapx.in'].includes(target.hostname)) return null;
		return target.href;
	} catch {
		return null;
	}
}

function safeAdminReturnTo(value) {
	const target = safeReturnTo(value);
	return target && new URL(target).hostname === 'admin.bapx.in' ? target : 'https://admin.bapx.in/';
}

async function handleAuthAPI(req, res, urlPath, host) {
	if (req.method === 'GET' && urlPath === '/api/auth/admin' && host === 'bapx.in') {
		const returnTo = safeAdminReturnTo(new URL(req.url, 'https://bapx.in').searchParams.get('returnTo'));
		const account = getSessionAccount(req);
		if (!account) {
			redirect(res, `https://bapx.in/login/?returnTo=${encodeURIComponent(returnTo)}`);
			return true;
		}
		const decision = authorizeAdminRequest(account, adminAuthorization);
		if (!decision.ok) {
			jsonResponse(res, decision.status, { error: decision.error });
			return true;
		}
		adminHandoffResponse(res, platformStore.createAdminHandoff(account.id), returnTo);
		return true;
	}
	if (req.method === 'POST' && urlPath === '/api/auth/admin/handoff' && host === 'admin.bapx.in') {
		if (req.headers.origin !== 'https://bapx.in') {
			jsonResponse(res, 403, { error: 'cross_origin_forbidden' });
			return true;
		}
		try {
			const body = await parseBody(req);
			const account = platformStore.redeemAdminHandoff(body.token);
			const decision = authorizeAdminRequest(account, adminAuthorization);
			if (!decision.ok) {
				jsonResponse(res, decision.status, { error: decision.error });
				return true;
			}
			setSessionCookie(res, platformStore.createSession(account.id).token, host);
			redirect(res, safeAdminReturnTo(body.returnTo));
		} catch {
			jsonResponse(res, 400, { error: 'invalid_handoff_request' });
		}
		return true;
	}
	if (req.method === 'GET' && urlPath === '/api/auth/oauth/github/cli-bootstrap' && host === 'bapx.in') {
		try {
			const url = new URL(req.url, 'https://bapx.in');
			const { account } = await platformStore.loginWithGitHub(consumeGitHubCliBootstrap(url.searchParams.get('token')));
			setSessionCookie(res, platformStore.createSession(account.id).token, host);
			redirect(res, safeReturnTo(url.searchParams.get('returnTo')) || 'https://platform.bapx.in/');
		} catch (error) {
			redirect(res, `/login/?error=${encodeURIComponent(error.message)}`);
		}
		return true;
	}
	if (req.method === 'GET' && urlPath === '/api/auth/oauth/github') {
		try {
			const authorization = githubAuthorization();
			const returnTo = safeReturnTo(new URL(req.url, 'https://bapx.in').searchParams.get('returnTo'));
			const cookies = [`bapx_oauth_state=${authorization.state}; Path=/api/auth/oauth/github; HttpOnly; Secure; SameSite=Lax; Max-Age=600`];
			if (returnTo) cookies.push(`bapx_oauth_return_to=${encodeURIComponent(returnTo)}; Path=/api/auth/oauth/github; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
			res.setHeader('Set-Cookie', cookies);
			redirect(res, authorization.url);
		} catch (error) {
			redirect(res, `/login/?error=${encodeURIComponent(error.message)}`);
		}
		return true;
	}
	if (req.method === 'GET' && urlPath === '/api/auth/oauth/github/manifest') {
		try {
			githubAppManifestResponse(res, githubAppManifestRegistration(new URL(req.url, 'https://bapx.in').searchParams.get('owner')));
		} catch (error) {
			redirect(res, `/login/?error=${encodeURIComponent(error.message)}`);
		}
		return true;
	}
	if (req.method === 'GET' && urlPath === '/api/auth/oauth/github/manifest/callback') {
		try {
			const url = new URL(req.url, 'https://bapx.in');
			const app = await exchangeGitHubAppManifestCode(url.searchParams.get('code'));
			githubInstallationTokenProvider = null;
			githubAppManifestConfiguredResponse(res, app);
		} catch (error) {
			redirect(res, `/login/?error=${encodeURIComponent(error.message)}`);
		}
		return true;
	}
	if (req.method === 'GET' && urlPath === '/api/auth/oauth/github/callback') {
		try {
			const url = new URL(req.url, 'https://bapx.in');
			if (!url.searchParams.get('state') || url.searchParams.get('state') !== getCookie(req, 'bapx_oauth_state')) throw new Error('GitHub login state is invalid or expired');
			const { account } = await platformStore.loginWithGitHub(await githubIdentity(url.searchParams.get('code')));
			// Authenticate first. Key provisioning is a convenience and must never
			// stand between a verified identity and their session: this previously
			// ran before the cookie was set, so a corrupt or unreadable key
			// collection threw here and locked every GitHub user out of an account
			// they had just proven they own.
			setSessionCookie(res, platformStore.createSession(account.id).token, host);
			// Every account gets a default API key on first sign-in so Agents works
			// immediately. Issued once — a returning user keeps the key they have,
			// and a user who deliberately revoked all keys does not get a new one
			// silently minted behind their back.
			try {
				if (!apiKeyStore.hasEverIssued(account.id)) apiKeyStore.issue(account.id, 'Default key');
			} catch (error) {
				// Sign-in still succeeds; the customer can mint a key from Platform.
				console.error('[bapx:auth] default API key provisioning failed', error);
			}
			const returnTo = safeReturnTo(decodeURIComponent(getCookie(req, 'bapx_oauth_return_to') || ''));
			redirect(res, returnTo || 'https://platform.bapx.in/');
		} catch (error) {
			redirect(res, `/login/?error=${encodeURIComponent(error.message)}`);
		}
		return true;
	}
	if (req.method === 'POST' && (urlPath === '/api/auth/password/register' || urlPath === '/api/auth/password/login')) {
		// Same-origin only: these set a session cookie shared across .bapx.in.
		const origin = req.headers.origin;
		let sameOrigin = false;
		try {
			sameOrigin = Boolean(origin) && new URL(origin).protocol === 'https:' && new URL(origin).host === host;
		} catch {
			sameOrigin = false;
		}
		if (!sameOrigin) { jsonResponse(res, 403, { error: 'cross_origin_forbidden' }); return true; }
		let payload;
		try {
			payload = parseBodyBuffer(await readRawBody(req, 16 * 1024), req.headers['content-type'] || '');
		} catch {
			jsonResponse(res, 400, { error: 'Invalid request' });
			return true;
		}
		try {
			const register = urlPath.endsWith('/register');
			const { account } = register
				? await platformStore.registerWithPassword(payload)
				: await platformStore.loginWithPassword(payload);
			setSessionCookie(res, platformStore.createSession(account.id).token, host);
			const returnTo = safeReturnTo(String(payload.returnTo || ''));
			jsonResponse(res, register ? 201 : 200, { redirect: returnTo || 'https://platform.bapx.in/' });
		} catch (error) {
			jsonResponse(res, 400, { error: error.message });
		}
		return true;
	}
	if (req.method === 'POST' && urlPath === '/api/auth/logout') {
		for (const token of getCookieValues(req, 'bapx_session')) platformStore.deleteSession(token);
		clearSessionCookie(res, host);
		redirect(res, 'https://bapx.in/login/');
		return true;
	}
	if (req.method === 'GET' && urlPath === '/api/auth/session') {
		const { token, account } = getSession(req);
		if (account) setSessionCookie(res, token, host);
		jsonResponse(res, account ? 200 : 401, { account });
		return true;
	}
	return false;
}

async function handleWorkspaceAPI(req, res, urlPath, scopeRoot = workspaceRoot) {
	const segments = urlPath.replace(/^\/api\/ws\//, '').split('/').filter(Boolean);
	if (req.method === 'GET' && segments[0] === 'tree') {
		const subPath = segments.slice(1).join('/') || '';
		const targetPath = resolveSafePath(subPath, scopeRoot);
		if (!targetPath) { jsonResponse(res, 403, { error: 'Forbidden' }); return true; }
		jsonResponse(res, 200, { items: buildFileTree(targetPath, subPath), path: subPath });
		return true;
	}
	if (req.method === 'GET' && segments[0] === 'file') {
		const parsed = new URL(req.url, `http://${req.headers.host}`);
		const filePath = parsed.searchParams.get('path') || '';
		const targetPath = resolveSafePath(filePath, scopeRoot);
		if (!targetPath) { jsonResponse(res, 403, { error: 'Forbidden' }); return true; }
		try {
			jsonResponse(res, 200, { content: fs.readFileSync(targetPath, 'utf-8'), path: filePath, ext: path.extname(targetPath) });
		} catch {
			jsonResponse(res, 404, { error: 'File not found' });
		}
		return true;
	}
	if (req.method === 'PUT' && segments[0] === 'file') {
		try {
			const body = await parseBody(req);
			const filePath = body.path || '';
			const targetPath = resolveSafePath(filePath, scopeRoot);
			if (!targetPath) { jsonResponse(res, 403, { error: 'Forbidden' }); return true; }
			fs.mkdirSync(path.dirname(targetPath), { recursive: true });
			fs.writeFileSync(targetPath, body.content, 'utf-8');
			jsonResponse(res, 200, { ok: true, path: filePath });
		} catch (error) {
			jsonResponse(res, 500, { error: error.message });
		}
		return true;
	}
	return false;
}

function customerWorkspaceRoot(account) {
	return customerBusinessWorkspaceRoot(workspaceRoot, account);
}

function customerWorkspaceScope(account) {
	const relative = path.relative(workspaceRoot, customerWorkspaceRoot(account));
	if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Invalid customer workspace scope');
	return relative.split(path.sep).join('/');
}

function runtimeHeaders(account) {
	return {
		'x-bapx-account': account.username,
		'x-bapx-workspace-scope': customerWorkspaceScope(account),
		'x-bapx-runtime-token': process.env.BAPX_RUNTIME_TOKEN || '',
	};
}

function proxyAgentAPI(req, res, account, upstreamPath = req.url) {
	return new Promise((resolve) => {
		const upstream = http.request({
			protocol: agentsRuntimeOrigin.protocol,
			hostname: agentsRuntimeOrigin.hostname,
			port: agentsRuntimeOrigin.port,
			method: req.method,
			path: upstreamPath,
			headers: { ...req.headers, host: agentsRuntimeOrigin.host, ...runtimeHeaders(account) },
		}, (upstreamResponse) => {
			res.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
			upstreamResponse.pipe(res);
			upstreamResponse.on('end', resolve);
		});
		upstream.on('error', () => {
			if (!res.headersSent) jsonResponse(res, 503, { error: 'The main agent is temporarily unavailable.' });
			else res.end();
			resolve();
		});
		req.pipe(upstream);
	});
}

function verifyWorkspaceRuntime(res, account) {
	return new Promise((resolve) => {
		const body = JSON.stringify({ account: account.username, workspaceScope: customerWorkspaceScope(account) });
		const upstream = http.request({
			protocol: agentsRuntimeOrigin.protocol,
			hostname: agentsRuntimeOrigin.hostname,
			port: agentsRuntimeOrigin.port,
			method: 'POST',
			path: '/api/workflows/workspace-verifier?wait=result',
			headers: {
				host: agentsRuntimeOrigin.host,
				'content-type': 'application/json',
				'content-length': Buffer.byteLength(body),
				...runtimeHeaders(account),
			},
		}, (upstreamResponse) => {
			res.writeHead(upstreamResponse.statusCode || 502, {
				'Content-Type': upstreamResponse.headers['content-type'] || 'application/json',
				'Cache-Control': 'no-store',
			});
			upstreamResponse.pipe(res);
			upstreamResponse.on('end', resolve);
		});
		upstream.on('error', () => {
			jsonResponse(res, 503, { error: 'Workspace verification is temporarily unavailable.' });
			resolve();
		});
		upstream.end(body);
	});
}

async function handleProjectsAPI(req, res, urlPath) {
	if (req.method === 'GET' && urlPath === '/api/projects') {
		jsonResponse(res, 200, { projects: listGitHubProjects({ workspaceRoot }) });
		return true;
	}
	if (req.method === 'POST' && urlPath === '/api/projects/resolve') {
		try {
			const body = await parseBody(req);
			const submittedRepository = resolveGitHubRepositoryReference(body.repositoryUrl);
			const { repository, metadata } = await resolveAuthorizedGitHubRepository(submittedRepository, {
				getInstallationToken: getGitHubInstallationToken,
			});
			const slug = suggestedProjectSlug(repository);
			jsonResponse(res, 200, {
				repository,
				metadata,
				project: { slug, path: `projects/${slug}` },
			});
		} catch (error) {
			if (error?.code) jsonResponse(res, error.status || 400, { error: error.code, message: error.message });
			else jsonResponse(res, 500, { error: 'resolve_failed', message: 'Repository resolution failed' });
		}
		return true;
	}
	if (req.method === 'POST' && urlPath === '/api/projects/import') {
		try {
			const body = await parseBody(req);
			const imported = await importPublicGitHubProject(body, { workspaceRoot });
			jsonResponse(res, 201, { project: { ...imported, name: imported.repository.fullName } });
		} catch (error) {
			if (error instanceof GitHubProjectImportError || error?.code) {
				jsonResponse(res, error.status || 400, { error: error.code || 'import_failed', message: error.message });
			} else jsonResponse(res, 500, { error: 'import_failed', message: 'Repository import failed' });
		}
		return true;
	}
	return false;
}

async function handleAdminAPI(req, res, urlPath) {
	const segments = urlPath.replace(/^\/admin\/api\//, '').split('/').filter(Boolean);
	if (req.method === 'GET' && segments.length === 1 && segments[0] === 'posts') { jsonResponse(res, 200, { posts: readPosts() }); return true; }
	if (req.method === 'GET' && segments.length === 2 && segments[0] === 'posts') {
		const post = readPosts().find((item) => item.slug === segments[1]);
		if (!post) { jsonResponse(res, 404, { error: 'Not found' }); return true; }
		jsonResponse(res, 200, { post }); return true;
	}
	if (req.method === 'POST' && segments.length === 1 && segments[0] === 'posts') {
		try {
			const body = await parseBody(req);
			const posts = readPosts();
			if (posts.some((item) => item.slug === body.slug)) { jsonResponse(res, 409, { error: 'Slug already exists' }); return true; }
			const post = { slug: body.slug, title: body.title || '', date: body.date || new Date().toISOString().slice(0, 10), author: body.author || '', authorUrl: body.authorUrl || '', description: body.description || '', category: body.category || '', content: body.content || '', published: body.published !== false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
			posts.push(post); writePosts(posts); jsonResponse(res, 201, { post });
		} catch (error) { jsonResponse(res, 400, { error: error.message }); }
		return true;
	}
	if ((req.method === 'PUT' || req.method === 'PATCH') && segments.length === 2 && segments[0] === 'posts') {
		try {
			const body = await parseBody(req);
			const posts = readPosts();
			const index = posts.findIndex((item) => item.slug === segments[1]);
			if (index === -1) { jsonResponse(res, 404, { error: 'Not found' }); return true; }
			posts[index] = { ...posts[index], ...body, slug: segments[1], updatedAt: new Date().toISOString() };
			writePosts(posts); jsonResponse(res, 200, { post: posts[index] });
		} catch (error) { jsonResponse(res, 400, { error: error.message }); }
		return true;
	}
	if (req.method === 'DELETE' && segments.length === 2 && segments[0] === 'posts') {
		const posts = readPosts();
		const index = posts.findIndex((item) => item.slug === segments[1]);
		if (index === -1) { jsonResponse(res, 404, { error: 'Not found' }); return true; }
		posts.splice(index, 1); writePosts(posts); jsonResponse(res, 200, { ok: true }); return true;
	}
	return false;
}

// OpenAI-compatible payloads do not need to be arbitrarily large, and this runs
// on a public endpoint: without a ceiling, one key holder can buffer an
// unbounded or never-ending chunked body and exhaust the process for everyone.
const MAX_API_BODY_BYTES = parseInt(process.env.BAPX_API_MAX_BODY_BYTES || '', 10) || 10 * 1024 * 1024;

class PayloadTooLargeError extends Error {
	constructor() {
		super('Request body is too large');
		this.name = 'PayloadTooLargeError';
	}
}

function readRawBody(req, limit = MAX_API_BODY_BYTES) {
	return new Promise((resolve, reject) => {
		const declared = parseInt(req.headers['content-length'] || '', 10);
		if (Number.isFinite(declared) && declared > limit) {
			reject(new PayloadTooLargeError());
			return;
		}
		const chunks = [];
		let size = 0;
		let rejected = false;
		req.on('data', (chunk) => {
			if (rejected) return;
			size += chunk.length;
			// Stop accumulating as soon as the ceiling is crossed rather than after
			// the body finishes — a chunked upload declares no length. Pause instead
			// of destroying: destroying here kills the socket before the 413 can be
			// written, which the client sees as a connection reset with no status.
			if (size > limit) {
				rejected = true;
				chunks.length = 0;
				req.pause();
				reject(new PayloadTooLargeError());
				return;
			}
			chunks.push(chunk);
		});
		req.on('end', () => resolve(Buffer.concat(chunks)));
		req.on('error', reject);
	});
}

// api.bapx.in — the customer-facing gateway.
//
// Only /v1/* is exposed. The plane's dashboard, admin and auth surfaces are
// single-tenant and must never be reachable from here.
async function handleApiGateway(req, res, urlPath) {
	// Guard on the path only, forward the full target including the query.
	const forwardTarget = req.url ?? urlPath;
	if (!urlPath.startsWith('/v1/')) {
		jsonResponse(res, 404, { error: { message: 'Unknown endpoint', type: 'not_found' } });
		return;
	}
	// verify() now throws rather than silently reporting "no keys" when the
	// collection is unreadable or corrupt. Surface that as 503 — the caller's key
	// may well be valid; we cannot tell.
	let identity;
	try {
		identity = apiKeyStore.verify(bearerToken(req));
	} catch {
		jsonResponse(res, 503, { error: { message: 'API key storage is unavailable', type: 'service_unavailable' } });
		return;
	}
	if (!identity) {
		res.writeHead(401, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'WWW-Authenticate': 'Bearer' });
		res.end(JSON.stringify({ error: { message: 'Invalid bapX API key', type: 'invalid_request_error' } }));
		return;
	}
	let body;
	if (req.method !== 'GET' && req.method !== 'HEAD') {
		try {
			body = await readRawBody(req);
		} catch (error) {
			const tooLarge = error?.name === 'PayloadTooLargeError';
			// Signal no keep-alive so the half-read body does not corrupt the next
			// request on this connection, without destroying the socket before the
			// status has flushed.
			if (tooLarge) res.shouldKeepAlive = false;
			jsonResponse(res, tooLarge ? 413 : 400, {
				error: { message: tooLarge ? `Request body exceeds ${MAX_API_BODY_BYTES} bytes` : 'Could not read request body', type: 'invalid_request_error' },
			});
			return;
		}
	}
	await proxyToApiPlane(req, res, { origin: apiPlaneOrigin, planeToken: apiPlaneToken, urlPath: forwardTarget, body });
}

// Parses an already-buffered body, so a size limit can be enforced while
// reading instead of after the whole payload is in memory.
// `null` and `"text"` are valid JSON, so parsing succeeds and the caller's
// property read then throws a TypeError. That escaped into the storage-failure
// guard and answered 503, reporting a client mistake as an outage and making a
// real storage fault indistinguishable from a bad request.
function isPlainObject(value) {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseBodyBuffer(buffer, contentType) {
	const text = buffer.toString('utf8');
	if (contentType.includes('application/x-www-form-urlencoded')) {
		return Object.fromEntries(new URLSearchParams(text));
	}
	return text ? JSON.parse(text) : {};
}

// decodeURIComponent throws URIError on a malformed escape such as a bare '%'.
// These handlers run inside an async request listener that Node neither awaits
// nor catches, so an escaping rejection can terminate the shared apps-www
// process. Decode defensively and treat undecodable ids as not found.
function decodeIdentifier(value) {
	try {
		return decodeURIComponent(value);
	} catch {
		return null;
	}
}

// The session cookie is scoped Domain=.bapx.in so it is shared with every
// subdomain, including customer-hosted project subdomains. A page there is
// same-site with Platform, so a plain HTML form POST carries the victim's
// session. Mutations must therefore verify the exact Origin, as the Admin
// routes already do. A missing Origin is rejected: browsers send it on every
// cross-origin write, so absence means this is not a browser form we trust.
function isPlatformMutationAllowed(req, host) {
	if (req.method === 'GET' || req.method === 'HEAD') return true;
	const origin = req.headers.origin;
	if (!origin) return false;
	try {
		const parsed = new URL(origin);
		return parsed.protocol === 'https:' && parsed.host === host;
	} catch {
		return false;
	}
}

// Business connector connections, for the Platform UI and Agents.
//
// Credentials go in and never come back out: every response here is metadata.
async function handleConnectorAPI(req, res, urlPath, host) {
	const account = getSessionAccount(req);
	if (!account) { jsonResponse(res, 401, { error: 'authentication_required' }); return true; }
	if (!isPlatformMutationAllowed(req, host)) { jsonResponse(res, 403, { error: 'cross_origin_forbidden' }); return true; }
	const businessSlug = account.primaryBusinessSlug || 'workspace';

	if (req.method === 'GET' && urlPath === '/api/platform/connections') {
		jsonResponse(res, 200, {
			configured: connectorStore.configured(),
			businessSlug,
			connections: connectorStore.list(account.id, businessSlug),
		});
		return true;
	}

	if (req.method === 'POST' && urlPath === '/api/platform/connections') {
		// A connector payload is a slug and a credential. Cap it well below the
		// gateway limit so an authenticated caller cannot buffer an unbounded body.
		let payload;
		try {
			const raw = await readRawBody(req, 64 * 1024);
			payload = parseBodyBuffer(raw, req.headers['content-type'] || '');
			if (!isPlainObject(payload)) throw new TypeError('Body must be an object');
		} catch (error) {
			const tooLarge = error?.name === 'PayloadTooLargeError';
			jsonResponse(res, tooLarge ? 413 : 400, {
				error: tooLarge ? 'Connector payload is too large' : 'Invalid request body',
			});
			return true;
		}
		try {
			const connection = connectorStore.connect(account.id, businessSlug, {
				slug: payload.slug,
				name: payload.name,
				category: payload.category,
				credential: payload.credential,
			});
			jsonResponse(res, 201, { connection });
		} catch (error) {
			jsonResponse(res, 400, { error: error.message });
		}
		return true;
	}

	if (req.method === 'DELETE' && urlPath.startsWith('/api/platform/connections/')) {
		const id = decodeIdentifier(urlPath.slice('/api/platform/connections/'.length));
		if (id === null) { jsonResponse(res, 404, { error: 'not_found' }); return true; }
		jsonResponse(res, connectorStore.disconnect(account.id, id) ? 200 : 404, { disconnected: id });
		return true;
	}

	return false;
}

// Session-authenticated key management for the Platform UI.
async function handleApiKeyAdmin(req, res, urlPath, host) {
	const account = getSessionAccount(req);
	if (!account) { jsonResponse(res, 401, { error: 'authentication_required' }); return true; }
	if (!isPlatformMutationAllowed(req, host)) { jsonResponse(res, 403, { error: 'cross_origin_forbidden' }); return true; }
	if (req.method === 'GET' && urlPath === '/api/platform/api-keys') {
		jsonResponse(res, 200, { keys: apiKeyStore.list(account.id) });
		return true;
	}
	if (req.method === 'POST' && urlPath === '/api/platform/api-keys') {
		// Bounded like the gateway and connector routes: a valid session must not
		// be enough to exhaust the shared process with one long-lived body.
		let payload;
		try {
			payload = JSON.parse((await readRawBody(req, 64 * 1024)).toString('utf8') || '{}');
			if (!isPlainObject(payload)) throw new TypeError('Body must be an object');
		} catch (error) {
			const tooLarge = error?.name === 'PayloadTooLargeError';
			jsonResponse(res, tooLarge ? 413 : 400, { error: tooLarge ? 'payload_too_large' : 'invalid_request' });
			return true;
		}
		const { secret, key } = apiKeyStore.issue(account.id, payload.name);
		jsonResponse(res, 201, { key, secret });
		return true;
	}
	if (req.method === 'DELETE' && urlPath.startsWith('/api/platform/api-keys/')) {
		const id = decodeIdentifier(urlPath.slice('/api/platform/api-keys/'.length));
		if (id === null) { jsonResponse(res, 404, { error: 'not_found' }); return true; }
		jsonResponse(res, apiKeyStore.revoke(account.id, id) ? 200 : 404, { revoked: id });
		return true;
	}
	return false;
}

http.createServer(async (req, res) => {
	const host = req.headers.host?.toLowerCase().replace(/:\d+$/, '') ?? 'bapx.in';
	const prefix = HOST_PREFIX[host] ?? '';
	const urlPath = req.url?.split('?')[0] ?? '';
	if (host === 'api.bapx.in') { await handleApiGateway(req, res, urlPath); return; }
	if (urlPath.startsWith('/api/platform/connections')) {
		// The stores now throw on unreadable or corrupt collections rather than
		// silently reporting "empty". Without a boundary here that rejection
		// escapes the async request listener, which Node neither awaits nor
		// catches, and takes down apps-www for every surface.
		try {
			if (await handleConnectorAPI(req, res, urlPath, host)) return;
		} catch {
			jsonResponse(res, 503, { error: 'connector_storage_unavailable' });
			return;
		}
	}
	if (urlPath.startsWith('/api/platform/api-keys')) {
		try {
			if (await handleApiKeyAdmin(req, res, urlPath, host)) return;
		} catch {
			jsonResponse(res, 503, { error: 'api_key_storage_unavailable' });
			return;
		}
	}
	if (host === 'docs.bapx.in' && urlPath === '/') { res.writeHead(302, { Location: 'https://docs.bapx.in/getting-started/quickstart/' }); res.end(); return; }
	if (urlPath.startsWith('/api/auth/')) {
		const handled = await handleAuthAPI(req, res, urlPath, host);
		if (handled) return;
	}
	const sessionAccount = getSessionAccount(req);
	if (prefix === '/platform' && urlPath.startsWith('/api/platform/connectors/openai-codex/')) {
		if (!sessionAccount) { jsonResponse(res, 401, { error: 'Sign in to manage connectors.' }); return; }
		// Missed when the sibling connector routes were protected. A page on a
		// customer-controlled subdomain carries the shared .bapx.in cookie, and a
		// simple credentialed POST needs no preflight — enough to start device
		// flows as the victim, each of which begins provider polling and occupies
		// an entry in the runtime's process-wide flow map.
		if (!isPlatformMutationAllowed(req, host)) { jsonResponse(res, 403, { error: 'cross_origin_forbidden' }); return; }
		const upstreamPath = urlPath.replace('/api/platform/connectors/openai-codex', '/api/orchestration/provider-auth/openai-codex');
		await proxyAgentAPI(req, res, sessionAccount, upstreamPath); return;
	}
	if (prefix === '/agents' && req.method === 'HEAD' && urlPath === '/') { res.writeHead(200, { 'Cache-Control': 'no-store' }); res.end(); return; }
	if (prefix === '/agents' && !sessionAccount) { redirect(res, `https://bapx.in/login/?returnTo=${encodeURIComponent(`https://agents.bapx.in${req.url || '/'}`)}`); return; }
	if (prefix === '/admin' && !urlPath.startsWith('/api/')) {
		const decision = authorizeAdminRequest(sessionAccount, adminAuthorization);
		if (decision.error === 'authentication_required') {
			const returnTo = safeAdminReturnTo(`https://admin.bapx.in${req.url || '/'}`);
			redirect(res, `https://bapx.in/api/auth/admin?returnTo=${encodeURIComponent(returnTo)}`);
			return;
		}
		if (!decision.ok) {
			res.writeHead(decision.status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
			res.end('Admin access is forbidden');
			return;
		}
	}
	if ((prefix === '/agents' || prefix === '/admin') && urlPath.startsWith('/api/agents/')) {
		if (prefix === '/admin') {
			if (!authorizeAdminApi(req, res, sessionAccount, host, req.method !== 'GET' && req.method !== 'HEAD')) return;
		} else if (!sessionAccount) {
			jsonResponse(res, 401, { error: 'Sign in to use the main agent.' }); return;
		}
		await proxyAgentAPI(req, res, sessionAccount); return;
	}
	if (prefix === '/agents' && req.method === 'GET' && urlPath === '/api/orchestration/workspace-verification') {
		await verifyWorkspaceRuntime(res, sessionAccount); return;
	}
	if (prefix === '/agents' && urlPath.startsWith('/api/orchestration/')) {
		// Same-site is not same-origin. The session cookie is scoped .bapx.in, so a
		// page on a hosted project subdomain carries it, and a text/plain fetch
		// containing JSON needs no preflight. Without this check such a page could
		// submit tasks as the victim, and approve or cancel known task ids.
		if (!isPlatformMutationAllowed(req, host)) {
			jsonResponse(res, 403, { error: 'cross_origin_forbidden' });
			return;
		}
		await proxyAgentAPI(req, res, sessionAccount); return;
	}
	if (prefix === '/agents' && urlPath.startsWith('/api/ws/')) {
		const handled = await handleWorkspaceAPI(req, res, urlPath, customerWorkspaceRoot(sessionAccount));
		if (handled) return;
	}
	if (prefix === '/admin' && urlPath.startsWith('/api/projects')) {
		if (!authorizeAdminApi(req, res, sessionAccount, host, req.method !== 'GET' && req.method !== 'HEAD')) return;
		const handled = await handleProjectsAPI(req, res, urlPath);
		if (handled) return;
	}
	if (prefix === '/admin' && urlPath.startsWith('/api/')) {
		if (!authorizeAdminApi(req, res, sessionAccount, host, req.method !== 'GET' && req.method !== 'HEAD')) return;
		if (urlPath.startsWith('/api/ws/')) {
			const handled = await handleWorkspaceAPI(req, res, urlPath, workspaceRoot);
			if (handled) return;
		}
		const handled = await handleAdminAPI(req, res, `/admin${urlPath}`);
		if (handled) return;
	}
	const suffix = urlPath.endsWith('/') || urlPath === '' ? 'index.html' : '';
	const sharedAsset = urlPath.startsWith('/_astro/') || urlPath.startsWith('/brand/') || /^\/(favicon|apple-touch-icon|site\.webmanifest|web-app-manifest|og\d)/.test(urlPath);
	const operatingSurface = prefix === '/admin' || prefix === '/agents';
	const operatingSurfaceAsset = prefix === '/agents' && (urlPath.startsWith('/assets/') || urlPath === '/icons.svg' || urlPath === '/favicon.svg');
	const candidates = sharedAsset
		? [path.join(root, urlPath, suffix), path.join(root, prefix, urlPath, suffix)]
		: operatingSurfaceAsset
			? [path.join(root, 'admin', urlPath, suffix), path.join(root, prefix, urlPath, suffix)]
			: operatingSurface
				? [path.join(root, prefix, urlPath, suffix)]
				: [path.join(root, prefix, urlPath, suffix), path.join(root, urlPath, suffix)];
	let finalPath = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
	if (!finalPath && operatingSurface && req.method === 'GET' && !path.extname(urlPath)) {
		const operatingSurfaceEntry = path.join(root, 'admin', 'index.html');
		if (fs.existsSync(operatingSurfaceEntry)) finalPath = operatingSurfaceEntry;
	}
	if (!finalPath) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found'); return; }
	const ext = path.extname(finalPath);
	try { res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' }); res.end(fs.readFileSync(finalPath)); }
	catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, () => {
	console.log(`bapX-www serving dist/ on :${port}`);
});
