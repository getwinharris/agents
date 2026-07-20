import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { resolveGitHubRepositoryReference } from './github-repository.mjs';

const PROJECT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,98}[a-z0-9])?$/;
const RESERVATION_STALE_AFTER_MS = 10 * 60 * 1000;

export class GitHubProjectImportError extends Error {
	constructor(code, message, status = 400) {
		super(message);
		this.name = 'GitHubProjectImportError';
		this.code = code;
		this.status = status;
	}
}

function fail(code, message, status) {
	throw new GitHubProjectImportError(code, message, status);
}

function defaultRunGit(args) {
	return new Promise((resolve) => {
		const child = spawn('git', args, { stdio: ['ignore', 'pipe', 'pipe'] });
		let stdout = '';
		let stderr = '';
		let settled = false;
		const finish = (result) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			resolve(result);
		};
		const append = (current, chunk) => `${current}${chunk}`.slice(-(1024 * 1024));
		child.stdout.setEncoding('utf8');
		child.stderr.setEncoding('utf8');
		child.stdout.on('data', (chunk) => { stdout = append(stdout, chunk); });
		child.stderr.on('data', (chunk) => { stderr = append(stderr, chunk); });
		child.on('error', (error) => finish({ status: null, stdout, stderr, error }));
		child.on('close', (status, signal) => finish({ status, signal, stdout, stderr }));
		const timeout = setTimeout(() => {
			child.kill('SIGTERM');
			finish({ status: null, signal: 'SIGTERM', stdout, stderr, error: Object.assign(new Error('Git command timed out'), { code: 'ETIMEDOUT' }) });
		}, 120_000);
		timeout.unref?.();
	});
}

function derivedProjectSlug(identity) {
	return `${identity.owner}-${identity.repository}`
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function normalizeProjectSlug(value, identity) {
	const slug = String(value || derivedProjectSlug(identity)).trim().toLowerCase();
	if (!PROJECT_SLUG_PATTERN.test(slug) || slug === '.' || slug === '..' || slug.includes('..')) {
		fail('invalid_project_slug', 'Project slug must use 1-100 lowercase letters, numbers, dots, hyphens, or underscores');
	}
	return slug;
}

function projectsRoot(workspaceRoot) {
	return path.join(path.resolve(workspaceRoot), 'projects');
}

function resolveDestination(workspaceRoot, slug) {
	const directory = projectsRoot(workspaceRoot);
	const destination = path.resolve(directory, slug);
	const relative = path.relative(directory, destination);
	if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
		fail('project_path_escape', 'Project destination must remain inside the Admin projects directory');
	}
	return { directory, destination, relativePath: `projects/${slug}` };
}

function processIsAlive(pid) {
	if (!Number.isInteger(pid) || pid <= 0) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return error?.code !== 'ESRCH';
	}
}

function reservationCanBeReclaimed(reservation) {
	let stat;
	try {
		stat = fs.statSync(reservation);
	} catch (error) {
		if (error?.code === 'ENOENT') return true;
		throw error;
	}
	const age = Date.now() - stat.mtimeMs;
	try {
		const owner = JSON.parse(fs.readFileSync(path.join(reservation, 'owner.json'), 'utf8'));
		if (owner.hostname === os.hostname() && !processIsAlive(owner.pid)) return true;
	} catch {
		// A process can terminate between creating the reservation directory and writing owner metadata.
	}
	return age >= RESERVATION_STALE_AFTER_MS;
}

function reclaimReservation(reservation) {
	const stale = `${reservation}.stale-${randomUUID()}`;
	try {
		fs.renameSync(reservation, stale);
	} catch (error) {
		if (error?.code === 'ENOENT') return true;
		return false;
	}
	fs.rmSync(stale, { recursive: true, force: true });
	return true;
}

function reserveDestination(directory, destination, slug) {
	const reservation = path.join(directory, `.import-${slug}.lock`);
	for (let attempt = 0; attempt < 3; attempt += 1) {
		try {
			fs.mkdirSync(reservation);
			fs.writeFileSync(path.join(reservation, 'owner.json'), `${JSON.stringify({
				pid: process.pid,
				hostname: os.hostname(),
				createdAt: new Date().toISOString(),
			})}\n`, 'utf8');
		} catch (error) {
			if (error?.code !== 'EEXIST') throw error;
			if (fs.existsSync(destination)) fail('project_exists', `Project ${slug} already exists`, 409);
			if (reservationCanBeReclaimed(reservation) && reclaimReservation(reservation)) continue;
			fail('project_exists', `Project ${slug} already exists or is being imported`, 409);
		}
		if (fs.existsSync(destination)) {
			fs.rmSync(reservation, { recursive: true, force: true });
			fail('project_exists', `Project ${slug} already exists`, 409);
		}
		return reservation;
	}
	fail('project_exists', `Project ${slug} already exists or is being imported`, 409);
}

function normalizeImportInput(input) {
	if (!input || typeof input !== 'object' || Array.isArray(input)) {
		fail('invalid_input', 'Repository import requires a repository URL, confirmed project slug, and explicit confirmation');
	}
	if (!input.repositoryUrl || !input.projectSlug) {
		fail('invalid_input', 'Repository import requires a repository URL, confirmed project slug, and explicit confirmation');
	}
	if (input.confirmed !== true) {
		fail('confirmation_required', 'Repository import requires explicit operator confirmation');
	}
	return { repositoryUrl: input.repositoryUrl, projectSlug: input.projectSlug };
}

function publicProject(projectsDirectory, directoryName) {
	const projectPath = path.join(projectsDirectory, directoryName);
	const metadataPath = path.join(projectPath, '.bapx-project.json');
	try {
		const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
		return {
			slug: directoryName,
			name: metadata.repository?.fullName || directoryName,
			repository: metadata.repository || null,
			commitSha: metadata.commitSha || null,
			operationId: metadata.operationId || null,
			status: metadata.status || null,
			path: `projects/${directoryName}`,
		};
	} catch {
		return {
			slug: directoryName,
			name: directoryName,
			repository: null,
			commitSha: null,
			operationId: null,
			status: null,
			path: `projects/${directoryName}`,
		};
	}
}

export function listGitHubProjects({ workspaceRoot }) {
	const directory = projectsRoot(workspaceRoot);
	try {
		return fs
			.readdirSync(directory, { withFileTypes: true })
			.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
			.map((entry) => publicProject(directory, entry.name))
			.sort((a, b) => a.name.localeCompare(b.name));
	} catch (error) {
		if (error?.code === 'ENOENT') return [];
		throw error;
	}
}

export function resolvePublicGitHubProjectImport(input, { workspaceRoot } = {}) {
	if (!workspaceRoot) fail('workspace_unavailable', 'Admin workspace root is not configured', 500);
	const { repositoryUrl, projectSlug } = normalizeImportInput(input);
	const repository = resolveGitHubRepositoryReference(repositoryUrl);
	const slug = normalizeProjectSlug(projectSlug, repository);
	const { destination, relativePath } = resolveDestination(workspaceRoot, slug);
	if (fs.existsSync(destination)) fail('project_exists', `Project ${slug} already exists`, 409);
	return {
		slug,
		path: relativePath,
		repository,
		visibility: 'public',
	};
}

export async function importPublicGitHubProject(input, { workspaceRoot, runGit = defaultRunGit } = {}) {
	const resolved = resolvePublicGitHubProjectImport(input, { workspaceRoot });
	const { slug, repository, path: relativePath } = resolved;
	const { directory, destination } = resolveDestination(workspaceRoot, slug);
	fs.mkdirSync(directory, { recursive: true });
	const reservation = reserveDestination(directory, destination, slug);

	const operationId = randomUUID();
	let temporary;
	try {
		temporary = fs.mkdtempSync(path.join(directory, `.import-${slug}-`));
		const clone = await runGit(['clone', '--depth', '1', '--', repository.httpsUrl, temporary]);
		if (clone?.error?.code === 'ENOENT') fail('git_unavailable', 'Git is unavailable on the Admin server', 503);
		if (clone?.status !== 0) fail('clone_failed', 'GitHub repository could not be cloned', 422);
		if (!fs.existsSync(path.join(temporary, '.git'))) fail('clone_invalid', 'Cloned repository is missing Git metadata', 502);

		const revision = await runGit(['-C', temporary, 'rev-parse', 'HEAD']);
		if (revision?.status !== 0 || !String(revision.stdout || '').trim()) {
			fail('revision_unavailable', 'Imported repository commit could not be verified', 502);
		}
		const commitSha = String(revision.stdout).trim();
		const metadata = {
			schemaVersion: 1,
			source: 'github',
			visibility: resolved.visibility,
			repository,
			commitSha,
			operationId,
			status: 'completed',
			importedAt: new Date().toISOString(),
		};
		fs.writeFileSync(path.join(temporary, '.bapx-project.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
		fs.renameSync(temporary, destination);
		temporary = undefined;
		return { ...resolved, commitSha, operationId, status: 'completed' };
	} catch (error) {
		if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
		throw error;
	} finally {
		fs.rmSync(reservation, { recursive: true, force: true });
	}
}
