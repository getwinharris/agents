import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { GitHubProjectImportError, importPublicGitHubProject, listGitHubProjects } from '../src/server/github-project-import.mjs';

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

test('imports a public repository atomically into the Admin projects owner', () => {
	const root = workspace();
	const result = importPublicGitHubProject('https://github.com/openai/openai-node.git', {
		workspaceRoot: root,
		runGit: successfulGit,
	});
	assert.equal(result.slug, 'openai-openai-node');
	assert.equal(result.path, 'projects/openai-openai-node');
	assert.equal(result.repository.fullName, 'openai/openai-node');
	assert.equal(result.commitSha, '0123456789abcdef');
	assert.equal(fs.readFileSync(path.join(root, result.path, 'README.md'), 'utf8'), '# Fixture\n');
	const metadata = JSON.parse(fs.readFileSync(path.join(root, result.path, '.bapx-project.json'), 'utf8'));
	assert.equal(metadata.visibility, 'public');
	assert.equal(metadata.repository.fullName, 'openai/openai-node');
	assert.deepEqual(listGitHubProjects({ workspaceRoot: root }).map((item) => item.slug), ['openai-openai-node']);
});

test('does not overwrite an existing project', () => {
	const root = workspace();
	const destination = path.join(root, 'projects/openai-openai-node');
	fs.mkdirSync(destination, { recursive: true });
	fs.writeFileSync(path.join(destination, 'keep.txt'), 'keep');
	assert.throws(
		() => importPublicGitHubProject('https://github.com/openai/openai-node', { workspaceRoot: root, runGit: successfulGit }),
		(error) => error instanceof GitHubProjectImportError && error.code === 'project_exists' && error.status === 409,
	);
	assert.equal(fs.readFileSync(path.join(destination, 'keep.txt'), 'utf8'), 'keep');
});

test('removes temporary directories when cloning fails', () => {
	const root = workspace();
	assert.throws(
		() => importPublicGitHubProject('https://github.com/openai/openai-node', {
			workspaceRoot: root,
			runGit: () => ({ status: 1, stdout: '', stderr: 'network failure' }),
		}),
		(error) => error instanceof GitHubProjectImportError && error.code === 'clone_failed',
	);
	const entries = fs.readdirSync(path.join(root, 'projects'));
	assert.deepEqual(entries, []);
});
