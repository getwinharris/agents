import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { importPublicGitHubProject, listGitHubProjects } from '../src/server/github-project-import.mjs';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));

function successfulGit(args) {
	if (args[0] === 'clone') {
		const target = args.at(-1);
		fs.mkdirSync(path.join(target, '.git'), { recursive: true });
		return { status: 0, stdout: '', stderr: '' };
	}
	if (args.includes('rev-parse')) return { status: 0, stdout: '0123456789abcdef\n', stderr: '' };
	return { status: 1, stdout: '', stderr: 'unexpected git command' };
}

test('project listings preserve completed import evidence after reload', async () => {
	const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bapx-project-import-evidence-'));
	const imported = await importPublicGitHubProject({
		repositoryUrl: 'https://github.com/openai/openai-node.git',
		projectSlug: 'admin-import-evidence',
		confirmed: true,
	}, { workspaceRoot, runGit: successfulGit });

	const [listed] = listGitHubProjects({ workspaceRoot });
	assert.equal(listed.operationId, imported.operationId);
	assert.equal(listed.status, 'completed');
	assert.equal(listed.commitSha, imported.commitSha);
});

test('Admin project cards render durable status, operation, and commit evidence', () => {
	const source = fs.readFileSync(path.resolve(testDirectory, '../admin/src/components/projects-page.tsx'), 'utf8');
	assert.match(source, /<dt[^>]*>Status<\/dt>[\s\S]*project\.status/);
	assert.match(source, /<dt[^>]*>Operation<\/dt>[\s\S]*project\.operationId/);
	assert.match(source, /<dt[^>]*>Commit<\/dt>[\s\S]*project\.commitSha/);
});

test('Admin import exposes distinct accessible progress, success, and failure states', () => {
	const source = fs.readFileSync(path.resolve(testDirectory, '../admin/src/components/projects-page.tsx'), 'utf8');
	assert.match(source, /kind: 'progress' \| 'success' \| 'error'/);
	assert.match(source, /data-state=\{status\.kind\}/);
	assert.match(source, /role=\{status\.kind === 'error' \? 'alert' : 'status'\}/);
	assert.match(source, /aria-live=\{status\.kind === 'error' \? 'assertive' : 'polite'\}/);
	assert.match(source, /kind: 'progress',[\s\S]*Resolving and importing repository/);
	assert.match(source, /kind: 'success',[\s\S]*Imported \$\{body\.project/);
	assert.match(source, /kind: 'error',[\s\S]*Repository import failed/);
});
