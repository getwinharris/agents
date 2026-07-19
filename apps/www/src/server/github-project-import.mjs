import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolveGitHubRepositoryReference } from './github-repository.mjs';

const PROJECT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,98}[a-z0-9])?$/;

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
	return spawnSync('git', args, {
		encoding: 'utf8',
		timeout: 120_000,
		maxBuffer: 1024 * 1024,
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

function normalizeImportInput(input) {
	if (!input || typeof input !== 'object' || Array.isArray(input)) {
		fail('invalid_input', 'Repository import requires a repository URL and confirmed project slug');
	}
	if (!input.repositoryUrl || !input.projectSlug) {
		fail('invalid_input', 'Repository import requires a repository URL and confirmed project slug');
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
			path: `projects/${directoryName}`,
		};
	} catch {
		return { slug: directoryName, name: directoryName, repository: null, commitSha: null, path: `projects/${directoryName}` };
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

export function importPublicGitHubProject(input, { workspaceRoot, runGit = defaultRunGit } = {}) {
	const resolved = resolvePublicGitHubProjectImport(input, { workspaceRoot });
	const { slug, repository, path: relativePath } = resolved;
	const { directory, destination } = resolveDestination(workspaceRoot, slug);
	fs.mkdirSync(directory, { recursive: true });

	const operationId = randomUUID();
	const temporary = fs.mkdtempSync(path.join(directory, `.import-${slug}-`));
	try {
		const clone = runGit(['clone', '--depth', '1', '--', repository.httpsUrl, temporary]);
		if (clone?.error?.code === 'ENOENT') fail('git_unavailable', 'Git is unavailable on the Admin server', 503);
		if (clone?.status !== 0) fail('clone_failed', 'GitHub repository could not be cloned', 422);
		if (!fs.existsSync(path.join(temporary, '.git'))) fail('clone_invalid', 'Cloned repository is missing Git metadata', 502);

		const revision = runGit(['-C', temporary, 'rev-parse', 'HEAD']);
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
			importedAt: new Date().toISOString(),
		};
		fs.writeFileSync(path.join(temporary, '.bapx-project.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
		fs.renameSync(temporary, destination);
		return { ...resolved, commitSha, operationId, status: 'completed' };
	} catch (error) {
		fs.rmSync(temporary, { recursive: true, force: true });
		throw error;
	}
}
