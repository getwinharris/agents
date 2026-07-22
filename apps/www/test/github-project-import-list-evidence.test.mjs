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

test('Admin submits the confirmed canonical repository through the existing import owner', () => {
	const source = fs.readFileSync(path.resolve(testDirectory, '../admin/src/components/projects-page.tsx'), 'utf8');
	assert.match(source, /fetch\('\/api\/projects\/import'/);
	assert.match(source, /body: JSON\.stringify\(\{[\s\S]*repositoryUrl: resolved\.repository\.httpsUrl,[\s\S]*projectSlug: projectSlug\.trim\(\),[\s\S]*confirmed,[\s\S]*\}\)/);
	assert.doesNotMatch(source, /repositoryUrl:\s*\{\s*repositoryUrl,\s*projectSlug,\s*confirmed\s*\}/);
});

test('Admin resolve and import expose distinct accessible progress, success, and failure states', () => {
	const source = fs.readFileSync(path.resolve(testDirectory, '../admin/src/components/projects-page.tsx'), 'utf8');
	assert.match(source, /kind: 'progress' \| 'success' \| 'error'/);
	assert.match(source, /data-state=\{status\.kind\}/);
	assert.match(source, /role=\{status\.kind === 'error' \? 'alert' : 'status'\}/);
	assert.match(source, /aria-live=\{status\.kind === 'error' \? 'assertive' : 'polite'\}/);
	assert.match(source, /kind: 'progress',[\s\S]*Resolving repository through the configured GitHub App/);
	assert.match(source, /kind: 'success',[\s\S]*Resolved \$\{next\.repository\.fullName\}/);
	assert.match(source, /kind: 'progress',[\s\S]*Importing the resolved repository/);
	assert.match(source, /kind: 'success',[\s\S]*Imported \$\{body\.project/);
	assert.match(source, /kind: 'error',[\s\S]*Repository import failed/);
});

test('Admin invalidates and aborts stale repository resolution when the input changes', () => {
	const source = fs.readFileSync(path.resolve(testDirectory, '../admin/src/components/projects-page.tsx'), 'utf8');
	assert.match(source, /const resolveRequestId = useRef\(0\)/);
	assert.match(source, /const resolveAbortController = useRef<AbortController \| null>\(null\)/);
	assert.match(source, /updateRepositoryUrl[\s\S]*resolveRequestId\.current \+= 1[\s\S]*resolveAbortController\.current\?\.abort\(\)/);
	assert.match(source, /signal: controller\.signal/);
	assert.match(source, /if \(requestId !== resolveRequestId\.current\) return/);
	assert.match(source, /requestId === resolveRequestId\.current[\s\S]*setResolving\(false\)/);
});

test('Admin project slug validation compiles with browser Unicode-set semantics', () => {
	const source = fs.readFileSync(path.resolve(testDirectory, '../admin/src/components/projects-page.tsx'), 'utf8');
	const pattern = source.match(/pattern="([^"]+)"/)?.[1];
	assert.ok(pattern);
	const validation = new RegExp(`^(?:${pattern})$`, 'v');
	assert.equal(validation.test('owner-repository'), true);
	assert.equal(validation.test('owner_repository.2'), true);
	assert.equal(validation.test('-owner'), false);
	assert.equal(validation.test('owner/repository'), false);
});
