import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
	GitHubProjectImportError,
	importPublicGitHubProject,
	listGitHubProjects,
	resolvePublicGitHubProjectImport,
} from '../src/server/github-project-import.mjs';

function workspace() {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'bapx-project-import-'));
}

function successfulGit(args) {
	if (args[0] === 'clone') {
		const target = args.at(-1);
		fs.mkdirSync(path.join(target, '.git'), { recursive: true });
		fs.writeFileSync(path.join(target, 'README.md'), '# Fixture\n');
		return { status: 0, stdout: '', stderr: '' };
	}
	if (args.includes('rev-parse')) return { status: 0, stdout: '0123456789abcdef\n', stderr: '' };
	return { status: 1, stdout: '', stderr: 'unexpected git command' };
}

test('resolves canonical repository identity and explicit destination before mutation', () => {
	const root = workspace();
	const result = resolvePublicGitHubProjectImport({
		repositoryUrl: 'git@github.com:openai/openai-node.git',
		projectSlug: 'admin-import-fixture',
	}, { workspaceRoot: root });
	assert.deepEqual(result, {
		slug: 'admin-import-fixture',
		path: 'projects/admin-import-fixture',
		repository: {
			owner: 'openai',
			repository: 'openai-node',
			fullName: 'openai/openai-node',
			httpsUrl: 'https://github.com/openai/openai-node.git',
		},
		visibility: 'public',
	});
	assert.equal(fs.existsSync(path.join(root, 'projects')), false);
});

test('imports a public repository atomically into the confirmed Admin project path', () => {
	const root = workspace();
	const result = importPublicGitHubProject({
		repositoryUrl: 'https://github.com/openai/openai-node.git',
		projectSlug: 'admin-import-fixture',
	}, {
		workspaceRoot: root,
		runGit: successfulGit,
	});
	assert.equal(result.slug, 'admin-import-fixture');
	assert.equal(result.path, 'projects/admin-import-fixture');
	assert.equal(result.repository.fullName, 'openai/openai-node');
	assert.equal(result.commitSha, '0123456789abcdef');
	assert.equal(result.status, 'completed');
	assert.match(result.operationId, /^[0-9a-f-]{36}$/);
	assert.equal(fs.readFileSync(path.join(root, result.path, 'README.md'), 'utf8'), '# Fixture\n');
	const metadata = JSON.parse(fs.readFileSync(path.join(root, result.path, '.bapx-project.json'), 'utf8'));
	assert.equal(metadata.visibility, 'public');
	assert.equal(metadata.repository.fullName, 'openai/openai-node');
	assert.equal(metadata.operationId, result.operationId);
	assert.deepEqual(listGitHubProjects({ workspaceRoot: root }).map((item) => item.slug), ['admin-import-fixture']);
});

test('does not overwrite an existing project', () => {
	const root = workspace();
	const destination = path.join(root, 'projects/admin-import-fixture');
	fs.mkdirSync(destination, { recursive: true });
	fs.writeFileSync(path.join(destination, 'keep.txt'), 'keep');
	assert.throws(
		() => importPublicGitHubProject({
			repositoryUrl: 'https://github.com/openai/openai-node',
			projectSlug: 'admin-import-fixture',
		}, { workspaceRoot: root, runGit: successfulGit }),
		(error) => error instanceof GitHubProjectImportError && error.code === 'project_exists' && error.status === 409,
	);
	assert.equal(fs.readFileSync(path.join(destination, 'keep.txt'), 'utf8'), 'keep');
});

test('rejects project slug traversal before creating directories', () => {
	const root = workspace();
	assert.throws(
		() => resolvePublicGitHubProjectImport({
			repositoryUrl: 'https://github.com/openai/openai-node',
			projectSlug: '../outside',
		}, { workspaceRoot: root }),
		(error) => error instanceof GitHubProjectImportError && error.code === 'invalid_project_slug',
	);
	assert.equal(fs.existsSync(path.join(root, 'projects')), false);
});

test('removes temporary directories when cloning fails', () => {
	const root = workspace();
	assert.throws(
		() => importPublicGitHubProject({
			repositoryUrl: 'https://github.com/openai/openai-node',
			projectSlug: 'admin-import-fixture',
		}, {
			workspaceRoot: root,
			runGit: () => ({ status: 1, stdout: '', stderr: 'network failure' }),
		}),
		(error) => error instanceof GitHubProjectImportError && error.code === 'clone_failed',
	);
	const entries = fs.readdirSync(path.join(root, 'projects'));
	assert.deepEqual(entries, []);
});
