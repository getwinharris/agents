import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ADMIN_HANDOFF_TTL_MS = 60_000;
const MAX_DATE_MS = 8_640_000_000_000_000;

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

function validSlug(value) {
	return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function markdown(title, description) {
	return `---\ntitle: ${JSON.stringify(title)}\ndescription: ${JSON.stringify(description)}\n---\n\n# ${title}\n\n${description}\n`;
}

function ensureUserWorkspace(workspaceRoot, account, business) {
	const usersRoot = path.join(workspaceRoot, 'users');
	const userRoot = path.join(usersRoot, account.username);
	const businessRoot = path.join(userRoot, business.slug);
	if (!path.resolve(userRoot).startsWith(`${path.resolve(usersRoot)}${path.sep}`)) throw new Error('Invalid username');
	if (fs.existsSync(userRoot)) throw new Error('Username already exists');

	fs.mkdirSync(path.join(businessRoot, 'logos'), { recursive: true });
	fs.mkdirSync(path.join(businessRoot, 'projects'), { recursive: true });
	fs.mkdirSync(path.join(businessRoot, 'collections'), { recursive: true });
	fs.mkdirSync(path.join(businessRoot, 'schemas'), { recursive: true });
	fs.copyFileSync(path.join(workspaceRoot, 'OKF.md'), path.join(userRoot, 'OKF.md'));
	fs.writeFileSync(path.join(userRoot, 'index.md'), markdown(account.name, `Workspace owned by ${account.username}.`));
	fs.writeFileSync(path.join(userRoot, 'map.mmd'), `flowchart TD\n  user[${JSON.stringify(account.username)}] --> business[${JSON.stringify(business.slug)}]\n`);
	fs.writeFileSync(path.join(businessRoot, 'index.md'), markdown(business.name, 'Business workspace.'));
	fs.writeFileSync(path.join(businessRoot, 'DESIGN.md'), markdown(`${business.name} Design`, 'Brand and interface constraints collected during onboarding.'));
	fs.writeFileSync(path.join(businessRoot, 'brand.css'), ':root {\n  --brand-name: "' + business.name.replaceAll('"', '\\"') + '";\n}\n');
	fs.writeFileSync(path.join(businessRoot, 'map.mmd'), `flowchart TD\n  business[${JSON.stringify(business.slug)}] --> projects\n  business --> logos\n  business --> collections\n`);
	fs.writeFileSync(path.join(businessRoot, 'logos/index.md'), markdown('Logos', 'Business logo assets.'));
	fs.writeFileSync(path.join(businessRoot, 'logos/map.mmd'), 'flowchart TD\n  logos\n');
	fs.writeFileSync(path.join(businessRoot, 'projects/index.md'), markdown('Projects', 'Projects owned by this business.'));
	fs.writeFileSync(path.join(businessRoot, 'projects/map.mmd'), 'flowchart TD\n  projects\n');
	writeJson(path.join(businessRoot, 'collections/business.json'), business);
	writeJson(path.join(businessRoot, 'schemas/business.schema.json'), {
		$schema: 'https://json-schema.org/draft/2020-12/schema',
		title: 'bapX business',
		type: 'object',
		required: ['id', 'name', 'slug', 'owner', 'socialLinks'],
		properties: {
			id: { type: 'string' }, name: { type: 'string' }, slug: { type: 'string' },
			owner: { type: 'string' }, website: { type: ['string', 'null'] },
			socialLinks: { type: 'object', additionalProperties: { type: 'string' } },
		},
	});
	execFileSync('git', ['init', '--quiet'], { cwd: userRoot });
}

function hashOpaqueToken(token) {
	return crypto.createHash('sha256').update(token).digest('hex');
}

function validAdminHandoffTime(now, { needsExpiry = false } = {}) {
	const maximum = needsExpiry ? MAX_DATE_MS - ADMIN_HANDOFF_TTL_MS : MAX_DATE_MS;
	return Number.isSafeInteger(now) && now >= 0 && now <= maximum;
}

function validAdminHandoffRecord(record) {
	if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
	if (!/^[a-f0-9]{64}$/.test(record.tokenHash)) return false;
	if (typeof record.accountId !== 'string' || !record.accountId) return false;
	if (record.audience !== 'admin') return false;
	if (typeof record.createdAt !== 'string' || typeof record.expiresAt !== 'string') return false;
	const createdAt = Date.parse(record.createdAt);
	const expiresAt = Date.parse(record.expiresAt);
	return Number.isSafeInteger(createdAt)
		&& Number.isSafeInteger(expiresAt)
		&& createdAt >= 0
		&& expiresAt === createdAt + ADMIN_HANDOFF_TTL_MS;
}

function readAdminHandoffs(file) {
	try {
		const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
		if (
			!stored
			|| typeof stored !== 'object'
			|| Array.isArray(stored)
			|| stored.schemaVersion !== 1
			|| !Array.isArray(stored.handoffs)
			|| !stored.handoffs.every(validAdminHandoffRecord)
		) {
			throw new Error('Corrupted or unsupported Admin handoffs schema');
		}
		return stored;
	} catch (error) {
		if (error?.code === 'ENOENT') return { schemaVersion: 1, handoffs: [] };
		throw error;
	}
}

export function createPlatformStore({ workspaceRoot }) {
	const platformRoot = path.join(workspaceRoot, 'data', 'platform');
	const accountsFile = path.join(platformRoot, 'collections', 'accounts.json');
	const sessionsFile = path.join(platformRoot, 'collections', 'sessions.json');
	const adminHandoffsFile = path.join(platformRoot, 'collections', 'admin-handoffs.json');
	writeJson(path.join(platformRoot, 'schemas', 'accounts.schema.json'), {
		$schema: 'https://json-schema.org/draft/2020-12/schema',
		title: 'bapX accounts collection',
		type: 'object',
		required: ['schemaVersion', 'accounts'],
		properties: {
			schemaVersion: { const: 2 },
			accounts: { type: 'array', items: { type: 'object', required: ['id', 'username', 'name', 'email', 'providers', 'createdAt', 'updatedAt'] } },
		},
	});
	writeJson(path.join(platformRoot, 'schemas', 'sessions.schema.json'), {
		$schema: 'https://json-schema.org/draft/2020-12/schema',
		title: 'bapX sessions collection',
		type: 'object',
		required: ['schemaVersion', 'sessions'],
		properties: {
			schemaVersion: { const: 2 },
			sessions: { type: 'array', items: { type: 'object', required: ['token', 'accountId', 'createdAt'] } },
		},
	});
	writeJson(path.join(platformRoot, 'schemas', 'admin-handoffs.schema.json'), {
		$schema: 'https://json-schema.org/draft/2020-12/schema',
		title: 'bapX Admin handoffs collection',
		type: 'object',
		required: ['schemaVersion', 'handoffs'],
		properties: {
			schemaVersion: { const: 1 },
			handoffs: { type: 'array', items: { type: 'object', required: ['tokenHash', 'accountId', 'audience', 'createdAt', 'expiresAt'] } },
		},
	});

	return {
		async loginWithGitHub(profile) {
			const providerId = String(profile.id ?? '');
			const username = String(profile.login ?? '').trim().toLowerCase();
			const email = String(profile.email ?? '').trim().toLowerCase();
			if (!providerId || !validSlug(username) || !email.includes('@')) throw new Error('GitHub returned an invalid identity');
			const stored = readJson(accountsFile, { schemaVersion: 2, accounts: [] });
			const accounts = { schemaVersion: 2, accounts: stored.accounts.map(({ passwordHash: _, ...account }) => account) };
			const existing = accounts.accounts.find((item) => item.providers?.some((provider) => provider.name === 'github' && provider.id === providerId));
			if (existing) return { account: existing, business: null, created: false };
			const emailAccount = accounts.accounts.find((item) => item.email === email);
			if (emailAccount) {
				if (emailAccount.providers?.some((provider) => provider.name === 'github')) throw new Error('GitHub identity conflicts with an existing account');
				emailAccount.providers = [...(emailAccount.providers || []), { name: 'github', id: providerId, login: username }];
				writeJson(accountsFile, accounts);
				return { account: emailAccount, business: null, created: false };
			}
			if (accounts.accounts.some((item) => item.username === username)) throw new Error('GitHub username conflicts with an existing account');
			const now = new Date().toISOString();
			const name = String(profile.name ?? '').trim() || username;
			const account = { id: crypto.randomUUID(), username, name, email, providers: [{ name: 'github', id: providerId, login: username }], createdAt: now, updatedAt: now };
			const business = { id: crypto.randomUUID(), name: `${name} Workspace`, slug: 'workspace', owner: username, website: null, socialLinks: {}, createdAt: now, updatedAt: now };
			ensureUserWorkspace(workspaceRoot, account, business);
			accounts.accounts.push(account);
			writeJson(accountsFile, accounts);
			return { account, business, created: true };
		},

		createSession(accountId) {
			const sessions = readJson(sessionsFile, { schemaVersion: 2, sessions: [] });
			const session = { token: crypto.randomBytes(32).toString('base64url'), accountId, createdAt: new Date().toISOString() };
			sessions.schemaVersion = 2;
			sessions.sessions.push(session);
			writeJson(sessionsFile, sessions);
			return session;
		},

		getSessionAccount(token) {
			if (!token) return null;
			const session = readJson(sessionsFile, { sessions: [] }).sessions.find((item) => item.token === token);
			if (!session) return null;
			const account = readJson(accountsFile, { accounts: [] }).accounts.find((item) => item.id === session.accountId);
			if (!account) return null;
			return account;
		},

		deleteSession(token) {
			const sessions = readJson(sessionsFile, { schemaVersion: 2, sessions: [] });
			const before = sessions.sessions.length;
			sessions.schemaVersion = 2;
			sessions.sessions = sessions.sessions.filter((item) => item.token !== token);
			if (before === sessions.sessions.length) return false;
			writeJson(sessionsFile, sessions);
			return true;
		},

		createAdminHandoff(accountId, { audience = 'admin', now = Date.now() } = {}) {
			if (!accountId || audience !== 'admin' || !validAdminHandoffTime(now, { needsExpiry: true })) {
				throw new Error('Invalid Admin handoff');
			}
			const token = crypto.randomBytes(32).toString('base64url');
			const createdAt = new Date(now).toISOString();
			const expiresAt = new Date(now + ADMIN_HANDOFF_TTL_MS).toISOString();
			const stored = readAdminHandoffs(adminHandoffsFile);
			stored.handoffs = stored.handoffs.filter((item) => Date.parse(item.expiresAt) > now);
			stored.handoffs.push({ tokenHash: hashOpaqueToken(token), accountId, audience, createdAt, expiresAt });
			writeJson(adminHandoffsFile, stored);
			return { token, audience, createdAt, expiresAt };
		},

		redeemAdminHandoff(token, { audience = 'admin', now = Date.now() } = {}) {
			if (typeof token !== 'string' || !token || audience !== 'admin' || !validAdminHandoffTime(now)) return null;
			const tokenHash = hashOpaqueToken(token);
			const stored = readAdminHandoffs(adminHandoffsFile);
			const handoff = stored.handoffs.find(
				(item) => item.tokenHash === tokenHash && item.audience === audience && Date.parse(item.expiresAt) > now,
			);
			const beforeCount = stored.handoffs.length;
			stored.handoffs = stored.handoffs.filter(
				(item) => item.tokenHash !== tokenHash && Date.parse(item.expiresAt) > now,
			);
			if (handoff || beforeCount !== stored.handoffs.length) writeJson(adminHandoffsFile, stored);
			if (!handoff) return null;
			return readJson(accountsFile, { accounts: [] }).accounts.find((item) => item.id === handoff.accountId) || null;
		},
	};
}
