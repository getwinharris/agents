import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);

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

async function hashPassword(password) {
	const salt = crypto.randomBytes(16);
	const digest = await scrypt(password, salt, 64);
	return `scrypt:${salt.toString('base64')}:${Buffer.from(digest).toString('base64')}`;
}

async function verifyPassword(password, encoded) {
	const [algorithm, saltText, digestText] = String(encoded).split(':');
	if (algorithm !== 'scrypt' || !saltText || !digestText) return false;
	const expected = Buffer.from(digestText, 'base64');
	const actual = Buffer.from(await scrypt(password, Buffer.from(saltText, 'base64'), expected.length));
	return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
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

export function createPlatformStore({ workspaceRoot }) {
	const platformRoot = path.join(workspaceRoot, 'data', 'platform');
	const accountsFile = path.join(platformRoot, 'collections', 'accounts.json');
	const sessionsFile = path.join(platformRoot, 'collections', 'sessions.json');
	writeJson(path.join(platformRoot, 'schemas', 'accounts.schema.json'), {
		$schema: 'https://json-schema.org/draft/2020-12/schema',
		title: 'bapX accounts collection',
		type: 'object',
		required: ['schemaVersion', 'accounts'],
		properties: {
			schemaVersion: { const: 1 },
			accounts: { type: 'array', items: { type: 'object', required: ['id', 'username', 'name', 'email', 'passwordHash', 'providers', 'createdAt', 'updatedAt'] } },
		},
	});
	writeJson(path.join(platformRoot, 'schemas', 'sessions.schema.json'), {
		$schema: 'https://json-schema.org/draft/2020-12/schema',
		title: 'bapX sessions collection',
		type: 'object',
		required: ['schemaVersion', 'sessions'],
		properties: {
			schemaVersion: { const: 1 },
			sessions: { type: 'array', items: { type: 'object', required: ['token', 'accountId', 'createdAt', 'expiresAt'] } },
		},
	});

	return {
		async signup(input) {
			const username = String(input.username ?? '').trim().toLowerCase();
			const email = String(input.email ?? '').trim().toLowerCase();
			const password = String(input.password ?? '');
			const slug = String(input.business?.slug ?? '').trim().toLowerCase();
			if (!validSlug(username) || !validSlug(slug)) throw new Error('Username and business slug must use lowercase letters, numbers, and hyphens');
			if (!email.includes('@')) throw new Error('A valid email is required');
			if (password.length < 12) throw new Error('Password must be at least 12 characters');
			const accounts = readJson(accountsFile, { schemaVersion: 1, accounts: [] });
			if (accounts.accounts.some((item) => item.email === email || item.username === username)) throw new Error('Account already exists');
			const now = new Date().toISOString();
			const account = { id: crypto.randomUUID(), username, name: String(input.name ?? '').trim(), email, passwordHash: await hashPassword(password), providers: [], createdAt: now, updatedAt: now };
			const business = { id: crypto.randomUUID(), name: String(input.business?.name ?? '').trim(), slug, owner: username, website: input.business?.website || null, socialLinks: input.business?.socialLinks || {}, createdAt: now, updatedAt: now };
			ensureUserWorkspace(workspaceRoot, account, business);
			accounts.accounts.push(account);
			writeJson(accountsFile, accounts);
			return { account, business };
		},

		async authenticatePassword(identity, password) {
			const normalized = String(identity).trim().toLowerCase();
			const accounts = readJson(accountsFile, { accounts: [] });
			const account = accounts.accounts.find((item) => item.email === normalized || item.username === normalized);
			if (!account || !(await verifyPassword(String(password), account.passwordHash))) return null;
			return account;
		},

		createSession(accountId) {
			const sessions = readJson(sessionsFile, { schemaVersion: 1, sessions: [] });
			const session = { token: crypto.randomBytes(32).toString('base64url'), accountId, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() };
			sessions.sessions = sessions.sessions.filter((item) => new Date(item.expiresAt).getTime() > Date.now());
			sessions.sessions.push(session);
			writeJson(sessionsFile, sessions);
			return session;
		},

		getSessionAccount(token) {
			if (!token) return null;
			const session = readJson(sessionsFile, { sessions: [] }).sessions.find((item) => item.token === token && new Date(item.expiresAt).getTime() > Date.now());
			if (!session) return null;
			const account = readJson(accountsFile, { accounts: [] }).accounts.find((item) => item.id === session.accountId);
			if (!account) return null;
			const { passwordHash, ...safeAccount } = account;
			return safeAccount;
		},
	};
}
