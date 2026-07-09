import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dirname, 'dist');
const port = parseInt(process.env.PORT || '3002', 10);
const dataDir = path.resolve(dirname, 'data');
const postsFile = path.join(dataDir, 'posts.json');

// Hostname -> path prefix mapping for subdomain-based serving.
const HOST_PREFIX = {
  'bapx.in': '',
  'www.bapx.in': '',
  'blog.bapx.in': '/blog',
  'mediahub.bapx.in': '/mediahub',
  'agents.bapx.in': '/agents',
  'admin.bapx.in': '/admin',
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

// --- Admin API helpers ---

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
