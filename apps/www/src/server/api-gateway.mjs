import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// bapX API gateway.
//
// Customers never reach the API plane directly. They present a bapX-issued key
// to api.bapx.in; this module resolves that key to an account and forwards the
// request to the internal plane. The plane is single-tenant and has no concept
// of our users, so tenancy is enforced here or not at all.

const KEY_PREFIX = 'bapx_sk_';
const SCHEMA_VERSION = 1;

function readJson(file, fallback) {
	let raw;
	try {
		raw = fs.readFileSync(file, 'utf8');
	} catch (error) {
		// A missing file is the legitimate first-run case. Anything else — EACCES,
		// EIO, a truncated read — must not be mistaken for "no keys": that would
		// fail every customer's key and let the next write overwrite the
		// collection with an empty one.
		if (error?.code === 'ENOENT') return fallback;
		throw new Error(`API key storage is unreadable (${error?.code || 'unknown'})`);
	}
	try {
		return JSON.parse(raw);
	} catch {
		throw new Error('API key storage is corrupt');
	}
}

function writeJson(file, value) {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	const temporary = `${file}.${process.pid}.tmp`;
	fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
	fs.renameSync(temporary, file);
}

function hashKey(secret) {
	return crypto.createHash('sha256').update(secret).digest('hex');
}

export function createApiKeyStore({ workspaceRoot }) {
	const platformRoot = path.join(workspaceRoot, 'data', 'platform');
	const keysFile = path.join(platformRoot, 'collections', 'api-keys.json');
	writeJson(path.join(platformRoot, 'schemas', 'api-keys.schema.json'), {
		$schema: 'https://json-schema.org/draft/2020-12/schema',
		title: 'bapX API keys collection',
		type: 'object',
		required: ['schemaVersion', 'keys'],
		properties: {
			schemaVersion: { const: SCHEMA_VERSION },
			keys: {
				type: 'array',
				items: {
					type: 'object',
					required: ['id', 'accountId', 'name', 'hash', 'prefix', 'createdAt'],
				},
			},
		},
	});

	function load() {
		const stored = readJson(keysFile, { schemaVersion: SCHEMA_VERSION, keys: [] });
		if (stored.schemaVersion !== SCHEMA_VERSION || !Array.isArray(stored.keys)) {
			return { schemaVersion: SCHEMA_VERSION, keys: [] };
		}
		return stored;
	}

	return {
		// The plaintext secret is returned exactly once, here. Only its hash is
		// persisted, so a leaked collection file cannot be replayed against the
		// plane.
		issue(accountId, name) {
			const cleanName = String(name || '').trim().slice(0, 64) || 'Default key';
			const secret = `${KEY_PREFIX}${crypto.randomBytes(32).toString('base64url')}`;
			const stored = load();
			const record = {
				id: crypto.randomUUID(),
				accountId,
				name: cleanName,
				hash: hashKey(secret),
				prefix: secret.slice(0, KEY_PREFIX.length + 6),
				createdAt: new Date().toISOString(),
				lastUsedAt: null,
			};
			stored.keys.push(record);
			stored.issued = [...new Set([...(stored.issued || []), accountId])];
			writeJson(keysFile, stored);
			return { secret, key: { ...record, hash: undefined } };
		},

		// Distinguishes "new account" from "user revoked everything". Reads the
		// issued ledger rather than the live key list so revocation is respected.
		hasEverIssued(accountId) {
			const stored = load();
			return (stored.issued || []).includes(accountId);
		},

		list(accountId) {
			return load()
				.keys.filter((item) => item.accountId === accountId)
				.map(({ hash: _hash, ...rest }) => rest);
		},

		revoke(accountId, id) {
			const stored = load();
			const next = stored.keys.filter((item) => !(item.id === id && item.accountId === accountId));
			if (next.length === stored.keys.length) return false;
			writeJson(keysFile, { ...stored, keys: next });
			return true;
		},

		// Constant-time compare on the hash so a timing signal cannot be used to
		// recover a valid key byte by byte.
		verify(secret) {
			if (!secret || !secret.startsWith(KEY_PREFIX)) return null;
			const digest = Buffer.from(hashKey(secret), 'hex');
			const stored = load();
			for (const record of stored.keys) {
				const candidate = Buffer.from(String(record.hash || ''), 'hex');
				if (candidate.length !== digest.length) continue;
				if (!crypto.timingSafeEqual(candidate, digest)) continue;
				record.lastUsedAt = new Date().toISOString();
				writeJson(keysFile, stored);
				return { id: record.id, accountId: record.accountId, name: record.name };
			}
			return null;
		},
	};
}

export function bearerToken(req) {
	const header = req.headers.authorization || '';
	const match = /^Bearer\s+(.+)$/i.exec(header.trim());
	return match ? match[1].trim() : '';
}

// Forwards an already-authorized request to the internal plane.
//
// The caller's Authorization header is deliberately NOT forwarded: the bapX key
// authenticates the customer to us, and carries no meaning to the plane. The
// plane is reached with its own credential.
// Endpoints a customer key may reach. An allowlist rather than a prefix test:
// the plane is single-tenant, so anything outside /v1 is operator surface.
const ALLOWED_PLANE_PATHS = new Set(['/v1/models', '/v1/chat/completions']);

export async function proxyToApiPlane(req, res, { origin, planeToken, urlPath, body }) {
	const target = new URL(urlPath, origin);

	// Check the NORMALIZED pathname, not the raw string. `new URL()` resolves
	// dot segments, so `/v1/%2e%2e/dashboard` passes a naive `/v1/` prefix test
	// and then normalizes to `/dashboard` — reaching the plane's single-tenant
	// dashboard with the plane's own token attached.
	if (!ALLOWED_PLANE_PATHS.has(target.pathname)) {
		res.writeHead(404, { 'content-type': 'application/json' });
		res.end(JSON.stringify({ error: { message: 'Unknown endpoint', type: 'not_found' } }));
		return;
	}
	const headers = { 'content-type': req.headers['content-type'] || 'application/json' };
	if (req.headers.accept) headers.accept = req.headers.accept;
	if (planeToken) headers.authorization = `Bearer ${planeToken}`;

	// Cancel upstream when the client goes away. Without this a cancelled
	// streaming completion keeps generating provider tokens the caller is billed
	// for and nobody receives.
	const controller = new AbortController();
	const abort = () => controller.abort();
	res.on('close', abort);

	let upstream;
	try {
		upstream = await fetch(target, {
			method: req.method,
			headers,
			body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
			signal: controller.signal,
		});
	} catch {
		res.removeListener('close', abort);
		if (!res.headersSent) {
			res.writeHead(502, { 'content-type': 'application/json' });
			res.end(JSON.stringify({ error: { message: 'API plane is unavailable', type: 'upstream_unavailable' } }));
		}
		return;
	}

	const responseHeaders = { 'content-type': upstream.headers.get('content-type') || 'application/json' };
	res.writeHead(upstream.status, responseHeaders);
	if (!upstream.body) {
		res.removeListener('close', abort);
		res.end();
		return;
	}

	// Streamed so token-by-token SSE responses are not buffered into one chunk.
	// The read loop must stay inside try/catch: a mid-stream upstream reset
	// rejects here, and this runs from an async request listener with no
	// rejection handler above it.
	const reader = upstream.body.getReader();
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			if (!res.write(Buffer.from(value))) {
				await new Promise((resolve) => res.once('drain', resolve));
			}
		}
		res.end();
	} catch {
		// Headers are already sent, so the status cannot be changed. Destroy the
		// socket to signal truncation rather than ending a partial body cleanly,
		// which a client would read as a complete response.
		res.destroy();
	} finally {
		res.removeListener('close', abort);
	}
}
