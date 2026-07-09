import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dirname, 'dist');
const port = parseInt(process.env.PORT || '3002', 10);

// Hostname → path prefix mapping for subdomain-based serving.
// The Astro build outputs all pages under dist/ with path-based URLs.
// The server rewrites request paths based on the Host header so that
// e.g. mediahub.bapx.in/clients/foo serves dist/mediahub/clients/foo/index.html.
const HOST_PREFIX = {
  'bapx.in': '',
  'www.bapx.in': '',
  'blog.bapx.in': '/blog',
  'mediahub.bapx.in': '/mediahub',
  'agents.bapx.in': '/agents',
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

http.createServer((req, res) => {
  const host = req.headers.host?.toLowerCase().replace(/:\d+$/, '') ?? 'bapx.in';
  const prefix = HOST_PREFIX[host] ?? '';
  const urlPath = req.url === '/' ? '' : (req.url?.split('?')[0] ?? '');
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
  console.log(`flue-www serving dist/ on :${port}`);
});
