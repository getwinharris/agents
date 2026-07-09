import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dirname, 'dist');
const port = parseInt(process.env.PORT || '3002', 10);
const dataDir = path.resolve(dirname, 'data');
const postsFile = path.join(dataDir, 'posts.json');
const workspaceRoot = process.env.WORKSPACE_ROOT || path.resolve(dirname, '../../..');

// Hostname -> path prefix mapping for subdomain-based serving.
const HOST_PREFIX = {
  'bapx.in': '',
  'www.bapx.in': '',
  'blog.bapx.in': '/blog',
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
};

const ALLOWED_EXTENSIONS = ['.md', '.mdx', '.mmd', '.json', '.ts', '.astro', '.css', '.mjs', '.yaml', '.yml', '.toml'];

// --- Workspace file API ---

function resolveSafePath(filePath) {
  const resolved = path.resolve(workspaceRoot, filePath);
  if (!resolved.startsWith(workspaceRoot)) return null;
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
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

// --- Workspace API router ---

async function handleWorkspaceAPI(req, res, urlPath) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }

  const segments = urlPath.replace(/^\/api\/ws\//, '').split('/').filter(Boolean);

  // GET /admin/api/ws/tree - list directory
  if (req.method === 'GET' && segments[0] === 'tree') {
    const subPath = segments.slice(1).join('/') || '';
    const targetPath = resolveSafePath(subPath);
    if (!targetPath) { jsonResponse(res, 403, { error: 'Forbidden' }); return true; }
    const tree = buildFileTree(targetPath, subPath);
    jsonResponse(res, 200, { items: tree, path: subPath });
    return true;
  }

  // GET /admin/api/ws/file?path=... - read file
  if (req.method === 'GET' && segments[0] === 'file') {
    const parsed = new URL(req.url, `http://${req.headers.host}`);
    const filePath = parsed.searchParams.get('path') || '';
    const targetPath = resolveSafePath(filePath);
    if (!targetPath) { jsonResponse(res, 403, { error: 'Forbidden' }); return true; }
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
      const targetPath = resolveSafePath(filePath);
      if (!targetPath) { jsonResponse(res, 403, { error: 'Forbidden' }); return true; }
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

  const segments = urlPath.replace(/^\/admin\/api\//, '').split('/').filter(Boolean);

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
    const post = posts.find(p => p.slug === slug);
    if (!post) { jsonResponse(res, 404, { error: 'Not found' }); return true; }
    jsonResponse(res, 200, { post });
    return true;
  }

  // POST /admin/api/posts - create
  if (req.method === 'POST' && segments.length === 1 && segments[0] === 'posts') {
    try {
      const body = await parseBody(req);
      const posts = readPosts();
      if (posts.some(p => p.slug === body.slug)) {
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
  if ((req.method === 'PUT' || req.method === 'PATCH') && segments.length === 2 && segments[0] === 'posts') {
    try {
      const slug = segments[1];
      const body = await parseBody(req);
      const posts = readPosts();
      const idx = posts.findIndex(p => p.slug === slug);
      if (idx === -1) { jsonResponse(res, 404, { error: 'Not found' }); return true; }
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
    const idx = posts.findIndex(p => p.slug === slug);
    if (idx === -1) { jsonResponse(res, 404, { error: 'Not found' }); return true; }
    posts.splice(idx, 1);
    writePosts(posts);
    jsonResponse(res, 200, { ok: true });
    return true;
  }

  return false;
}

// --- Main server ---

http.createServer(async (req, res) => {
  const host = req.headers.host?.toLowerCase().replace(/:\d+$/, '') ?? 'bapx.in';
  const prefix = HOST_PREFIX[host] ?? '';
  const urlPath = req.url?.split('?')[0] ?? '';

  // Admin API routes
  if (prefix === '/admin' && urlPath.startsWith('/api/')) {
    if (urlPath.startsWith('/admin/api/ws/')) {
      const handled = await handleWorkspaceAPI(req, res, urlPath);
      if (handled) return;
    }
    const handled = await handleAdminAPI(req, res, urlPath);
    if (handled) return;
  }

  const filePath = path.join(root, prefix, urlPath, urlPath.endsWith('/') || urlPath === '' ? 'index.html' : '');

  let finalPath = filePath;
  if (!fs.existsSync(finalPath) || fs.statSync(finalPath).isDirectory()) {
    finalPath = path.join(finalPath, 'index.html');
  }
  if (!fs.existsSync(finalPath)) {
    finalPath = path.join(root, 'index.html');
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
}).listen(port, () => {
  console.log(`bapX-www serving dist/ on :${port}`);
});
