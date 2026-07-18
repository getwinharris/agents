import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPlatformStore } from './src/server/platform-store.mjs';
import { githubAuthorization, githubIdentity } from './src/server/github-oauth.mjs';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dirname, 'dist');
const port = parseInt(process.env.PORT || '3002', 10);
const dataDir = path.resolve(dirname, 'data');
const postsFile = path.join(dataDir, 'posts.json');
const workspaceRoot = process.env.WORKSPACE_ROOT || path.resolve(dirname, '../../..');
const platformStore = createPlatformStore({ workspaceRoot });
const agentsRuntimeOrigin = new URL(process.env.AGENTS_RUNTIME_ORIGIN || 'http://127.0.0.1:3003');

// Hostname -> path prefix mapping for subdomain-based serving.
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

const ALLOWED_EXTENSIONS = [
	'.md',
	'.mdx',
	'.mmd',
	'.json',
	'.ts',
	'.astro',
	'.css',
	'.mjs',
	'.yaml',
	'.yml',
	'.toml',
];

// --- Workspace file API ---

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
			if (entry.isDirectory()) {
				items.push({ type: 'directory', name: entry.name, path: relPath });
			} else {
				const ext = path.extname(entry.name);
				if (ALLOWED_EXTENSIONS.includes(ext)) {
					items.push({ type: 'file', name: entry.name, path: relPath, ext });
				}
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
	res.writeHead(status, { 'Content-Type': 'application/json' });
	res.end(JSON.stringify(data));
}

function parseBody(req) {
	return new Promise((resolve, reject) => {
		let body = '';
		req.on('data', (chunk) => {
			body += chunk;
		});
		req.on('end', () => {
			try {
				const type = req.headers['content-type'] || '';
				if (type.includes('application/x-www-form-urlencoded')) {
					resolve(Object.fromEntries(new URLSearchParams(body)));
				} else resolve(JSON.parse(body));
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

function setSessionCookie(res, token) {
	res.setHeader('Set-Cookie', `bapx_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=34560000`);
}

function getCookie(req, name) {
	return String(req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

function getSessionAccount(req) {
	return platformStore.getSessionAccount(getCookie(req, 'bapx_session'));
}

function safeReturnTo(value) {
	if (!value) return null;
	try {
		const target = new URL(value);
		if (target.protocol !== 'https:' || target.username || target.password) return null;
		if (!['agents.bapx.in', 'platform.bapx.in'].includes(target.hostname)) return null;
		return target.href;
	} catch {
		return null;
	}
}

async function handleAuthAPI(req, res, urlPath) {
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
	if (req.method === 'GET' && urlPath === '/api/auth/oauth/github/callback') {
		try {
			const url = new URL(req.url, 'https://bapx.in');
			if (!url.searchParams.get('state') || url.searchParams.get('state') !== getCookie(req, 'bapx_oauth_state')) throw new Error('GitHub login state is invalid or expired');
			const { account } = await platformStore.loginWithGitHub(await githubIdentity(url.searchParams.get('code')));
			setSessionCookie(res, platformStore.createSession(account.id).token);
			const returnTo = safeReturnTo(decodeURIComponent(getCookie(req, 'bapx_oauth_return_to') || ''));
			redirect(res, returnTo || 'https://platform.bapx.in/');
		} catch (error) {
			redirect(res, `/login/?error=${encodeURIComponent(error.message)}`);
		}
		return true;
	}
	if (req.method === 'POST' && urlPath === '/api/auth/logout') {
		platformStore.deleteSession(getCookie(req, 'bapx_session'));
		res.setHeader('Set-Cookie', 'bapx_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
		redirect(res, 'https://bapx.in/login/');
		return true;
	}
	if (req.method === 'GET' && urlPath === '/api/auth/session') {
		const token = getCookie(req, 'bapx_session');
		const account = platformStore.getSessionAccount(token);
		if (account) setSessionCookie(res, token);
		jsonResponse(res, account ? 200 : 401, { account });
		return true;
	}
	return false;
}

// --- Workspace API router ---

async function handleWorkspaceAPI(req, res, urlPath, scopeRoot = workspaceRoot) {
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

	if (req.method === 'OPTIONS') {
		res.writeHead(204);
		res.end();
		return true;
	}

	const segments = urlPath
		.replace(/^\/api\/ws\//, '')
		.split('/')
		.filter(Boolean);

	// GET /admin/api/ws/tree - list directory
	if (req.method === 'GET' && segments[0] === 'tree') {
		const subPath = segments.slice(1).join('/') || '';
		const targetPath = resolveSafePath(subPath, scopeRoot);
		if (!targetPath) {
			jsonResponse(res, 403, { error: 'Forbidden' });
			return true;
		}
		const tree = buildFileTree(targetPath, subPath);
		jsonResponse(res, 200, { items: tree, path: subPath });
		return true;
	}

	// GET /admin/api/ws/file?path=... - read file
	if (req.method === 'GET' && segments[0] === 'file') {
		const parsed = new URL(req.url, `http://${req.headers.host}`);
		const filePath = parsed.searchParams.get('path') || '';
		const targetPath = resolveSafePath(filePath, scopeRoot);
		if (!targetPath) {
			jsonResponse(res, 403, { error: 'Forbidden' });
			return true;
		}
		try {
			const content = fs.readFileSync(targetPath, 'utf-8');
			const ext = path.extname(targetPath);
			jsonResponse(res, 200, { content, path: filePath, ext });
		} catch (e) {
			jsonResponse(res, 404, { error: 'File not found' });
		}
		return true;
	}

	// PUT /admin/api/ws/file - write file
	if (req.method === 'PUT' && segments[0] === 'file') {
		try {
			const body = await parseBody(req);
			const filePath = body.path || '';
			const targetPath = resolveSafePath(filePath, scopeRoot);
			if (!targetPath) {
				jsonResponse(res, 403, { error: 'Forbidden' });
				return true;
			}
			fs.mkdirSync(path.dirname(targetPath), { recursive: true });
			fs.writeFileSync(targetPath, body.content, 'utf-8');
			jsonResponse(res, 200, { ok: true, path: filePath });
		} catch (e) {
			jsonResponse(res, 500, { error: e.message });
		}
		return true;
	}

	return false;
}

function customerWorkspaceRoot(account) {
	return path.join(workspaceRoot, 'users', account.username, 'workspace');
}

function proxyAgentAPI(req, res, account) {
	return new Promise((resolve) => {
		const upstream = http.request({
			protocol: agentsRuntimeOrigin.protocol,
			hostname: agentsRuntimeOrigin.hostname,
			port: agentsRuntimeOrigin.port,
			method: req.method,
			path: req.url,
			headers: {
				...req.headers,
				host: agentsRuntimeOrigin.host,
				'x-bapx-account': account.username,
				'x-bapx-runtime-token': process.env.BAPX_RUNTIME_TOKEN || '',
			},
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

// --- Admin API router ---

async function handleAdminAPI(req, res, urlPath) {
	// CORS headers for admin UI
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

	if (req.method === 'OPTIONS') {
		res.writeHead(204);
		res.end();
		return true;
	}

	const segments = urlPath
		.replace(/^\/admin\/api\//, '')
		.split('/')
		.filter(Boolean);

	// GET /admin/api/posts - list all
	if (req.method === 'GET' && segments.length === 1 && segments[0] === 'posts') {
		const posts = readPosts();
		jsonResponse(res, 200, { posts });
		return true;
	}

	// GET /admin/api/posts/:slug - get single
	if (req.method === 'GET' && segments.length === 2 && segments[0] === 'posts') {
		const slug = segments[1];
		const posts = readPosts();
		const post = posts.find((p) => p.slug === slug);
		if (!post) {
			jsonResponse(res, 404, { error: 'Not found' });
			return true;
		}
		jsonResponse(res, 200, { post });
		return true;
	}

	// POST /admin/api/posts - create
	if (req.method === 'POST' && segments.length === 1 && segments[0] === 'posts') {
		try {
			const body = await parseBody(req);
			const posts = readPosts();
			if (posts.some((p) => p.slug === body.slug)) {
				jsonResponse(res, 409, { error: 'Slug already exists' });
				return true;
			}
			const post = {
				slug: body.slug,
				title: body.title || '',
				date: body.date || new Date().toISOString().slice(0, 10),
				author: body.author || '',
				authorUrl: body.authorUrl || '',
				description: body.description || '',
				category: body.category || '',
				content: body.content || '',
				published: body.published !== false,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};
			posts.push(post);
			writePosts(posts);
			jsonResponse(res, 201, { post });
		} catch (e) {
			jsonResponse(res, 400, { error: e.message });
		}
		return true;
	}

	// PUT /admin/api/posts/:slug - update
	if (
		(req.method === 'PUT' || req.method === 'PATCH') &&
		segments.length === 2 &&
		segments[0] === 'posts'
	) {
		try {
			const slug = segments[1];
			const body = await parseBody(req);
			const posts = readPosts();
			const idx = posts.findIndex((p) => p.slug === slug);
			if (idx === -1) {
				jsonResponse(res, 404, { error: 'Not found' });
				return true;
			}
			posts[idx] = { ...posts[idx], ...body, slug, updatedAt: new Date().toISOString() };
			writePosts(posts);
			jsonResponse(res, 200, { post: posts[idx] });
		} catch (e) {
			jsonResponse(res, 400, { error: e.message });
		}
		return true;
	}

	// DELETE /admin/api/posts/:slug - delete
	if (req.method === 'DELETE' && segments.length === 2 && segments[0] === 'posts') {
		const slug = segments[1];
		let posts = readPosts();
		const idx = posts.findIndex((p) => p.slug === slug);
		if (idx === -1) {
			jsonResponse(res, 404, { error: 'Not found' });
			return true;
		}
		posts.splice(idx, 1);
		writePosts(posts);
		jsonResponse(res, 200, { ok: true });
		return true;
	}

	return false;
}

// --- Main server ---

http
	.createServer(async (req, res) => {
		const host = req.headers.host?.toLowerCase().replace(/:\d+$/, '') ?? 'bapx.in';
		const prefix = HOST_PREFIX[host] ?? '';
		const urlPath = req.url?.split('?')[0] ?? '';
		if (host === 'docs.bapx.in' && urlPath === '/') {
			res.writeHead(302, {
				Location: 'https://docs.bapx.in/getting-started/quickstart/',
			});
			res.end();
			return;
		}
		if (urlPath.startsWith('/api/auth/')) {
			const handled = await handleAuthAPI(req, res, urlPath);
			if (handled) return;
		}
		const sessionAccount = getSessionAccount(req);
		if (prefix === '/agents' && !sessionAccount) {
			const returnTo = encodeURIComponent(`https://agents.bapx.in${req.url || '/'}`);
			redirect(res, `https://bapx.in/login/?returnTo=${returnTo}`);
			return;
		}
		if ((prefix === '/agents' || prefix === '/admin') && urlPath.startsWith('/api/agents/')) {
			if (!sessionAccount) {
				jsonResponse(res, 401, { error: 'Sign in to use the main agent.' });
				return;
			}
			await proxyAgentAPI(req, res, sessionAccount);
			return;
		}
		if (prefix === '/agents' && urlPath.startsWith('/api/ws/')) {
			const handled = await handleWorkspaceAPI(
				req,
				res,
				urlPath,
				customerWorkspaceRoot(sessionAccount),
			);
			if (handled) return;
		}

		// Admin API routes
		if (prefix === '/admin' && urlPath.startsWith('/api/')) {
			if (urlPath.startsWith('/api/ws/')) {
				const handled = await handleWorkspaceAPI(req, res, urlPath);
				if (handled) return;
			}
			const handled = await handleAdminAPI(req, res, `/admin${urlPath}`);
			if (handled) return;
		}

		const suffix = urlPath.endsWith('/') || urlPath === '' ? 'index.html' : '';
		const sharedAsset =
			urlPath.startsWith('/_astro/') ||
			urlPath.startsWith('/brand/') ||
			/^\/(favicon|apple-touch-icon|site\.webmanifest|web-app-manifest|og\d)/.test(urlPath);
		const operatingSurface = prefix === '/admin' || prefix === '/agents';
		const candidates = sharedAsset
			? [path.join(root, urlPath, suffix), path.join(root, prefix, urlPath, suffix)]
			: operatingSurface
				? [path.join(root, prefix, urlPath, suffix)]
				: [path.join(root, prefix, urlPath, suffix), path.join(root, urlPath, suffix)];
		let finalPath = candidates.find(
			(candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
		);
		if (
			!finalPath &&
			operatingSurface &&
			req.method === 'GET' &&
			!path.extname(urlPath)
		) {
			const operatingSurfaceEntry = path.join(root, 'admin', 'index.html');
			if (fs.existsSync(operatingSurfaceEntry)) finalPath = operatingSurfaceEntry;
		}

		if (!finalPath) {
			res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
			res.end('Not found');
			return;
		}

		const ext = path.extname(finalPath);
		const contentType = MIME[ext] || 'application/octet-stream';
		try {
			const content = fs.readFileSync(finalPath);
			res.writeHead(200, { 'Content-Type': contentType });
			res.end(content);
		} catch {
			res.writeHead(404);
			res.end('Not found');
		}
	})
	.listen(port, () => {
		console.log(`bapX-www serving dist/ on :${port}`);
	});
