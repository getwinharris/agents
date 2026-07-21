import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('passes the complete confirmed browser payload through the existing Admin import route', () => {
	const server = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');

	assert.match(
		server,
		/const body = await parseBody\(req\);[\s\S]*await importPublicGitHubProject\(body,\s*\{\s*workspaceRoot\s*\}\)/s,
		'the route must preserve repositoryUrl, projectSlug, and confirmed instead of reducing the request to a URL string',
	);
	assert.doesNotMatch(
		server,
		/importPublicGitHubProject\(body\.repositoryUrl,\s*\{\s*workspaceRoot\s*\}\)/s,
		'the route must not discard the edited slug and explicit confirmation',
	);
});
