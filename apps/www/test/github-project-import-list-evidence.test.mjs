import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { importPublicGitHubProject, listGitHubProjects } from '../src/server/github-project-import.mjs';

function successfulGit(args) {
	if (args[0] === 'clone') {
		const target = args.at(-1);
		fs.mkdirSync(path.join(target, '.git'), { recursive: true });
		return { status: 0, stdout: '', stderr: '' };
	}
	if (args.includes('rev-parse')) return { status: 0, stdout: '0123456789abcdef\n', stderr: '' };
	return { status: 1, stdout: '', stderr: 'unexpected git command' };
}

test('project listings preserve completed import evidence after reload', () => {
	const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bapx-project-import-evidence-'));
	const imported = importPublicGitHubProject({
		repositoryUrl: 'https://github.com/openai/openai-node.git',
		projectSlug: 'admin-import-evidence',
		confirmed: true,
	}, { workspaceRoot, runGit: successfulGit });

	const [listed] = listGitHubProjects({ workspaceRoot });
	assert.equal(listed.operationId, imported.operationId);
	assert.equal(listed.status, 'completed');
	assert.equal(listed.commitSha, imported.commitSha);
});
