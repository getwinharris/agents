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

export function primaryBusinessSlugForAccount(account) {
	const slug = String(account?.primaryBusinessSlug || 'workspace').trim().toLowerCase();
	if (!validSlug(slug)) throw new Error('Invalid primary business slug');
	return slug;
}

export function customerBusinessWorkspaceRoot(workspaceRoot, account, businessSlug = primaryBusinessSlugForAccount(account)) {
	const usersRoot = path.resolve(workspaceRoot, 'users');
	const username = String(account?.username || '').trim().toLowerCase();
	const slug = String(businessSlug || '').trim().toLowerCase();
	if (!validSlug(username) || !validSlug(slug)) throw new Error('Invalid customer workspace scope');
	const resolved = path.resolve(usersRoot, username, slug);
	if (!resolved.startsWith(`${usersRoot}${path.sep}`)) throw new Error('Invalid customer workspace root');
	return resolved;
}

export function customerProjectWorkspaceRoot(workspaceRoot, account, projectSlug, businessSlug = primaryBusinessSlugForAccount(account)) {
	const project = String(projectSlug || '').trim().toLowerCase();
	if (!validSlug(project)) throw new Error('Invalid project slug');
	const businessRoot = customerBusinessWorkspaceRoot(workspaceRoot, account, businessSlug);
	const resolved = path.resolve(businessRoot, 'projects', project);
	if (!resolved.startsWith(`${path.resolve(businessRoot, 'projects')}${path.sep}`)) throw new Error('Invalid project workspace root');
	return resolved;
}

export function browserProfileRoot(workspaceRoot, account, { businessSlug, projectSlug = 'business', actor = 'shared' } = {}) {
	const business = businessSlug || primaryBusinessSlugForAccount(account);
	const project = String(projectSlug || 'business').trim().toLowerCase();
	const actorScope = String(actor || 'shared').trim().toLowerCase();
	if (!validSlug(project) || !validSlug(actorScope)) throw new Error('Invalid browser profile scope');
	const scopeRoot = project === 'business'
		? customerBusinessWorkspaceRoot(workspaceRoot, account, business)
		: customerProjectWorkspaceRoot(workspaceRoot, account, project, business);
	const profileId = crypto
		.createHash('sha256')
		.update([account.id, account.username, business, project, actorScope].join(':'))
		.digest('hex')
		.slice(0, 32);
	const resolved = path.resolve(scopeRoot, '.agents', 'browser', 'profiles', profileId);
	if (!resolved.startsWith(`${path.resolve(scopeRoot)}${path.sep}`)) throw new Error('Invalid browser profile root');
	return resolved;
}

function folderIndex({ title, description, type = 'folder-index', children = [] }) {
	const quote = (value) => JSON.stringify(value);
	const childLines = children.length === 0
		? ''
		: `children:\n${children.map((child) => [
			`  - path: ${quote(child.path)}`,
			`    title: ${quote(child.title)}`,
			child.description ? `    description: ${quote(child.description)}` : '',
		].filter(Boolean).join('\n')).join('\n')}\n`;
	return `title: ${quote(title)}\ndescription: ${quote(description)}\ntype: ${quote(type)}\n${childLines}`;
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
	fs.writeFileSync(path.join(userRoot, 'index.yaml'), folderIndex({
		title: account.name,
		description: `Workspace owned by ${account.username}.`,
		children: [
			{ path: 'OKF.md', title: 'OKF contract' },
			{ path: 'map.mmd', title: 'Workspace map' },
			{ path: `${business.slug}/`, title: business.name },
		],
	}));
	fs.writeFileSync(path.join(userRoot, 'map.mmd'), `flowchart TD\n  user[${JSON.stringify(account.username)}] --> business[${JSON.stringify(business.slug)}]\n`);
	fs.writeFileSync(path.join(businessRoot, 'index.yaml'), folderIndex({
		title: business.name,
		description: 'Business workspace.',
		children: [
			{ path: 'DESIGN.md', title: `${business.name} Design` },
			{ path: 'brand.css', title: 'Brand CSS' },
			{ path: 'logos/', title: 'Logos' },
			{ path: 'projects/', title: 'Projects' },
			{ path: 'map.mmd', title: 'Business map' },
		],
	}));
	fs.writeFileSync(path.join(businessRoot, 'DESIGN.md'), `---\ntitle: ${JSON.stringify(`${business.name} Design`)}\ndescription: "Brand and interface constraints collected during onboarding."\n---\n\n# ${business.name} Design\n\nBrand and interface constraints collected during onboarding.\n`);
	fs.writeFileSync(path.join(businessRoot, 'brand.css'), ':root {\n  --brand-name: "' + business.name.replaceAll('"', '\\"') + '";\n}\n');
	fs.writeFileSync(path.join(businessRoot, 'map.mmd'), `flowchart TD\n  business[${JSON.stringify(business.slug)}] --> projects\n  business --> logos\n  business --> collections\n`);
	fs.writeFileSync(path.join(businessRoot, 'logos/index.yaml'), folderIndex({ title: 'Logos', description: 'Business logo assets.' }));
	fs.writeFileSync(path.join(businessRoot, 'logos/map.mmd'), 'flowchart TD\n  logos\n');
	fs.writeFileSync(path.join(businessRoot, 'projects/index.yaml'), folderIndex({ title: 'Projects', description: 'Projects owned by this business.' }));
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

// Password credentials.
//
// scrypt with a per-account salt — a plain hash is brute-forceable against a
// leaked collection, and the account file is the same file that holds email
// addresses. Verification is constant-time.
function hashPassword(password) {
	const salt = crypto.randomBytes(16);
	const derived = crypto.scryptSync(String(password), salt, 64);
	return { algorithm: 'scrypt', salt: salt.toString('base64'), hash: derived.toString('base64') };
}

function verifyPassword(password, record) {
	if (!record || record.algorithm !== 'scrypt') return false;
	try {
		const salt = Buffer.from(record.salt, 'base64');
		const expected = Buffer.from(record.hash, 'base64');
		const derived = crypto.scryptSync(String(password), salt, expected.length);
		return crypto.timingSafeEqual(derived, expected);
	} catch {
		return false;
	}
}

// Derive a workspace username from an email local part, since a password
// account has no GitHub login to borrow. Collisions get a numeric suffix rather
// than failing signup on a name the user never chose.
function usernameFromEmail(email, taken) {
	const base = String(email).split('@')[0].toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'user';
	let candidate = validSlug(base) ? base : `user-${base}`.slice(0, 39);
	let suffix = 1;
	while (taken.has(candidate)) {
		suffix += 1;
		candidate = `${base.slice(0, 30)}-${suffix}`;
	}
	return candidate;
}

// Credential material never leaves the store. Every account returned to a
// caller goes through here.
function publicAccount(account) {
	const { passwordHash: _passwordHash, ...safe } = account;
	return safe;
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
			// Read the collection AS STORED. Stripping passwordHash here and then
			// writing the result back erased the credential of every password
			// account in the file on any GitHub signup — silent, permanent, and
			// affecting accounts unrelated to the one signing in. Hashes stay in
			// storage; they are stripped only from what is returned to a caller.
			const accounts = readJson(accountsFile, { schemaVersion: 2, accounts: [] });
			const existing = accounts.accounts.find((item) => item.providers?.some((provider) => provider.name === 'github' && provider.id === providerId));
			if (existing) return { account: publicAccount(existing), business: null, created: false };
			const emailAccount = accounts.accounts.find((item) => item.email === email);
			if (emailAccount) {
				if (emailAccount.providers?.some((provider) => provider.name === 'github')) throw new Error('GitHub identity conflicts with an existing account');
				emailAccount.providers = [...(emailAccount.providers || []), { name: 'github', id: providerId, login: username }];
				writeJson(accountsFile, accounts);
				return { account: publicAccount(emailAccount), business: null, created: false };
			}
			if (accounts.accounts.some((item) => item.username === username)) throw new Error('GitHub username conflicts with an existing account');
			const now = new Date().toISOString();
			const name = String(profile.name ?? '').trim() || username;
			const account = { id: crypto.randomUUID(), username, name, email, primaryBusinessSlug: 'workspace', providers: [{ name: 'github', id: providerId, login: username }], createdAt: now, updatedAt: now };
			const business = { id: crypto.randomUUID(), name: `${name} Workspace`, slug: 'workspace', owner: username, website: null, socialLinks: {}, createdAt: now, updatedAt: now };
			ensureUserWorkspace(workspaceRoot, account, business);
			accounts.accounts.push(account);
			writeJson(accountsFile, accounts);
			return { account, business, created: true };
		},

		// Email + password registration. GitHub remains available and can be linked
		// later, but it is no longer required to hold a bapX account.
		async registerWithPassword({ email, password, name }) {
			const cleanEmail = String(email ?? '').trim().toLowerCase();
			const cleanPassword = String(password ?? '');
			if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new Error('Enter a valid email address');
			if (cleanPassword.length < 12) throw new Error('Use a password of at least 12 characters');
			if (cleanPassword.length > 512) throw new Error('That password is too long');

			const stored = readJson(accountsFile, { schemaVersion: 2, accounts: [] });
			const accounts = { schemaVersion: 2, accounts: stored.accounts };
			if (accounts.accounts.some((item) => item.email === cleanEmail)) {
				throw new Error('An account already exists for that email address. Sign in instead.');
			}
			const taken = new Set(accounts.accounts.map((item) => item.username));
			const username = usernameFromEmail(cleanEmail, taken);
			const now = new Date().toISOString();
			const displayName = String(name ?? '').trim().slice(0, 64) || username;
			const account = {
				id: crypto.randomUUID(),
				username,
				name: displayName,
				email: cleanEmail,
				primaryBusinessSlug: 'workspace',
				providers: [],
				passwordHash: hashPassword(cleanPassword),
				createdAt: now,
				updatedAt: now,
			};
			const business = { id: crypto.randomUUID(), name: `${displayName} Workspace`, slug: 'workspace', owner: username, website: null, socialLinks: {}, createdAt: now, updatedAt: now };
			ensureUserWorkspace(workspaceRoot, account, business);
			accounts.accounts.push(account);
			writeJson(accountsFile, accounts);
			return { account: { ...account, passwordHash: undefined }, business, created: true };
		},

		// Always runs the same work for a missing account as for a wrong password,
		// so response timing does not reveal which emails are registered.
		async loginWithPassword({ email, password }) {
			const cleanEmail = String(email ?? '').trim().toLowerCase();
			const stored = readJson(accountsFile, { schemaVersion: 2, accounts: [] });
			const account = stored.accounts.find((item) => item.email === cleanEmail);
			const record = account?.passwordHash ?? { algorithm: 'scrypt', salt: crypto.randomBytes(16).toString('base64'), hash: crypto.randomBytes(64).toString('base64') };
			const ok = verifyPassword(password, record);
			if (!account || !ok) throw new Error('That email address and password do not match an account.');
			return { account: { ...account, passwordHash: undefined } };
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
			// Never hand the credential material back out. /api/auth/session
			// serialises whatever this returns straight to the browser.
			const { passwordHash: _passwordHash, ...safe } = account;
			return safe;
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
