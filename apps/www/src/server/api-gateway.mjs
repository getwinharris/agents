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
	try {
		return JSON.parse(fs.readFileSync(file, 'utf8'));
	} catch {
		return fallback;
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
export async function proxyToApiPlane(req, res, { origin, planeToken, urlPath, body }) {
	const target = new URL(urlPath, origin);
	const headers = { 'content-type': req.headers['content-type'] || 'application/json' };
	if (req.headers.accept) headers.accept = req.headers.accept;
	if (planeToken) headers.authorization = `Bearer ${planeToken}`;

	let upstream;
	try {
		upstream = await fetch(target, {
			method: req.method,
			headers,
			body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
		});
	} catch {
		res.writeHead(502, { 'content-type': 'application/json' });
		res.end(JSON.stringify({ error: { message: 'API plane is unavailable', type: 'upstream_unavailable' } }));
		return;
	}

	const responseHeaders = { 'content-type': upstream.headers.get('content-type') || 'application/json' };
	res.writeHead(upstream.status, responseHeaders);
	if (!upstream.body) {
		res.end();
		return;
	}
	// Streamed so token-by-token SSE responses are not buffered into one chunk.
	const reader = upstream.body.getReader();
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		res.write(Buffer.from(value));
	}
	res.end();
}
