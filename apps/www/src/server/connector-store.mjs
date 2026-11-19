import crypto from 'node:crypto';
import { readJson as readCollection, writeJson } from './json-store.mjs';
import path from 'node:path';

// Business connector connections.
//
// A connection is a customer's own credential for a third-party service, stored
// against one business. Credentials are encrypted at rest with AES-256-GCM and
// are never returned to any caller — not to the Platform UI, not to Agents, not
// in an error payload. Callers get metadata; only the runtime resolves a secret,
// and only for the business that owns it.

const SCHEMA_VERSION = 1;

function normalizeSlug(value) {
	const clean = String(value || '').trim().toLowerCase();
	return /^[a-z0-9][a-z0-9-]{0,63}$/.test(clean) ? clean : '';
}
const ALGORITHM = 'aes-256-gcm';



// The key must be supplied. A generated-at-boot fallback would silently make
// every stored credential unreadable after a restart, which is worse than
// refusing to store one.
function encryptionKey() {
	const raw = process.env.BAPX_CREDENTIAL_ENCRYPTION_KEY || '';
	if (!raw) return null;
	// One variable configures two services: apps-www (here) and agents-runtime,
	// which decodes it as base64. Accepting only hex meant no single value could
	// satisfy both — a hex key decodes to 48 bytes there, and a base64 key was
	// rejected here — so one of the two features was always broken in production.
	//
	// Accept either encoding, but still require a real 32-byte key. Hashing an
	// arbitrary passphrase would inherit the passphrase's entropy and leave a
	// weak operator secret brute-forceable against the ciphertext.
	const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
	return key.length === 32 ? key : null;
}

function encrypt(plaintext) {
	const key = encryptionKey();
	if (!key) throw new Error('Connector credential storage is not configured');
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
	const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
	return {
		iv: iv.toString('base64'),
		tag: cipher.getAuthTag().toString('base64'),
		value: encrypted.toString('base64'),
	};
}

function decrypt(record) {
	const key = encryptionKey();
	if (!key) throw new Error('Connector credential storage is not configured');
	const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(record.iv, 'base64'));
	decipher.setAuthTag(Buffer.from(record.tag, 'base64'));
	return Buffer.concat([decipher.update(Buffer.from(record.value, 'base64')), decipher.final()]).toString('utf8');
}

// Never widen this. It is what the UI and Agents are allowed to see.
function publicView(connection) {
	return {
		id: connection.id,
		businessSlug: connection.businessSlug,
		slug: connection.slug,
		name: connection.name,
		category: connection.category,
		status: connection.status,
		hint: connection.hint,
		createdAt: connection.createdAt,
		updatedAt: connection.updatedAt,
		lastUsedAt: connection.lastUsedAt ?? null,
	};
}

export function createConnectorStore({ workspaceRoot }) {
	const platformRoot = path.join(workspaceRoot, 'data', 'platform');
	const file = path.join(platformRoot, 'collections', 'connectors.json');
	writeJson(path.join(platformRoot, 'schemas', 'connectors.schema.json'), {
		$schema: 'https://json-schema.org/draft/2020-12/schema',
		title: 'bapX business connector connections',
		type: 'object',
		required: ['schemaVersion', 'connections'],
		properties: {
			schemaVersion: { const: SCHEMA_VERSION },
			connections: {
				type: 'array',
				items: {
					type: 'object',
					required: ['id', 'accountId', 'businessSlug', 'slug', 'name', 'status', 'createdAt'],
				},
			},
		},
	});

	function load() {
		const stored = readCollection(file, { schemaVersion: SCHEMA_VERSION, connections: [] }, "Connector storage");
		// A well-formed file with an unexpected shape is corruption or a rollback,
		// not first-run state. Returning empty here would reject every existing
		// record and let the next write persist the empty-derived collection.
		if (stored.schemaVersion !== SCHEMA_VERSION || !Array.isArray(stored.connections)) {
			throw new Error('Connector storage has an unsupported schema');
		}
		return stored;
	}

	return {
		configured() {
			return Boolean(encryptionKey());
		},

		list(accountId, businessSlug) {
			const scope = normalizeSlug(businessSlug);
			return load()
				.connections.filter((item) => item.accountId === accountId && (!scope || item.businessSlug === scope))
				.map(publicView);
		},

		// Connecting the same service twice replaces the credential rather than
		// creating a duplicate — a customer rotating a key should not end up with
		// two connections where one silently keeps working.
		connect(accountId, businessSlug, { slug, name, category, credential }) {
			const cleanBusiness = normalizeSlug(businessSlug);
			if (!cleanBusiness) throw new Error('Business is invalid');
			const cleanSlug = String(slug || '').trim().toLowerCase();
			if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(cleanSlug)) throw new Error('Connector is invalid');
			const secret = String(credential || '').trim();
			if (!secret) throw new Error('A credential is required');
			if (secret.length > 8192) throw new Error('Credential is too large');

			const stored = load();
			const now = new Date().toISOString();
			// The catalogue is not slug-unique: `cloudflare` exists under both
			// `deploy` and `sandboxes`. Keying identity on slug alone meant
			// connecting the sandbox after the host silently replaced the host's
			// credential while keeping its name and category, and the UI showed
			// both cards connected against one record.
			const cleanCategory = String(category || 'channels').slice(0, 32);
			const existing = stored.connections.find(
				(item) =>
					item.accountId === accountId &&
					item.businessSlug === cleanBusiness &&
					item.slug === cleanSlug &&
					item.category === cleanCategory,
			);
			const secretRecord = encrypt(secret);
			// Show enough to recognise which credential is stored, never enough to use it.
			const hint = secret.length <= 8 ? '••••' : `••••${secret.slice(-4)}`;

			if (existing) {
				Object.assign(existing, { secret: secretRecord, hint, status: 'connected', updatedAt: now });
				writeJson(file, stored);
				return publicView(existing);
			}

			const connection = {
				id: crypto.randomUUID(),
				accountId,
				businessSlug: cleanBusiness,
				slug: cleanSlug,
				name: String(name || cleanSlug).slice(0, 64),
				category: cleanCategory,
				status: 'connected',
				hint,
				secret: secretRecord,
				createdAt: now,
				updatedAt: now,
				lastUsedAt: null,
			};
			stored.connections.push(connection);
			writeJson(file, stored);
			return publicView(connection);
		},

		disconnect(accountId, id) {
			const stored = load();
			const next = stored.connections.filter((item) => !(item.id === id && item.accountId === accountId));
			if (next.length === stored.connections.length) return false;
			writeJson(file, { ...stored, connections: next });
			return true;
		},

		// The only path that returns plaintext. Scoped to one account + business so
		// a connection can never be resolved across a tenant boundary.
		resolveCredential(accountId, businessSlug, slug, category) {
			const stored = load();
			const scope = normalizeSlug(businessSlug);
			// Callers that know the category get an exact match; callers that do not
			// still resolve when the slug is unambiguous for that business.
			const wanted = String(slug || '').toLowerCase();
			const matches = stored.connections.filter(
				(item) => item.accountId === accountId && item.businessSlug === scope && item.slug === wanted,
			);
			const connection = matches.length === 1 ? matches[0] : matches.find((item) => item.category === category);
			if (!connection?.secret) return null;
			// Decrypt first: stamping lastUsedAt before decrypting records a
			// successful resolution that never returned a credential.
			const plaintext = decrypt(connection.secret);
			connection.lastUsedAt = new Date().toISOString();
			writeJson(file, stored);
			return plaintext;
		},
	};
}
