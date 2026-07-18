import assert from 'node:assert/strict';
import test from 'node:test';
import {
	GitHubRepositoryReferenceError,
	resolveGitHubRepositoryReference,
} from '../src/server/github-repository.mjs';

const expected = {
	owner: 'getwinharris',
	repository: 'agents',
	fullName: 'getwinharris/agents',
	httpsUrl: 'https://github.com/getwinharris/agents.git',
};

test('normalizes supported GitHub HTTPS and SSH repository references', () => {
	for (const reference of [
		'https://github.com/getwinharris/agents',
		'https://github.com/getwinharris/agents.git',
		'git@github.com:getwinharris/agents.git',
		'ssh://git@github.com/getwinharris/agents.git',
	]) {
		assert.deepEqual(resolveGitHubRepositoryReference(reference), expected);
	}
});

test('preserves canonical GitHub owner and repository spelling', () => {
	assert.deepEqual(resolveGitHubRepositoryReference('https://github.com/OpenAI/openai-node'), {
		owner: 'OpenAI',
		repository: 'openai-node',
		fullName: 'OpenAI/openai-node',
		httpsUrl: 'https://github.com/OpenAI/openai-node.git',
	});
});

test('rejects non-GitHub hosts and unsupported protocols', () => {
	assertReferenceError('https://gitlab.com/getwinharris/agents', 'unsupported_host');
	assertReferenceError('git://github.com/getwinharris/agents.git', 'unsupported_protocol');
});

test('rejects credentials, missing SSH users, ports, queries, and fragments', () => {
	assertReferenceError('https://token@github.com/getwinharris/agents.git', 'embedded_credentials');
	assertReferenceError('git@github.com:password/getwinharris/agents.git', 'unsupported_path');
	assertReferenceError('ssh://github.com/getwinharris/agents.git', 'embedded_credentials');
	assertReferenceError('ssh://user@github.com/getwinharris/agents.git', 'embedded_credentials');
	assertReferenceError('https://github.com:443/getwinharris/agents.git', 'ambiguous_reference');
	assertReferenceError('ssh://git@github.com:22/getwinharris/agents.git', 'ambiguous_reference');
	assertReferenceError('https://github.com:444/getwinharris/agents.git', 'ambiguous_reference');
	assertReferenceError('https://github.com/getwinharris/agents?tab=readme', 'ambiguous_reference');
	assertReferenceError('https://github.com/getwinharris/agents#readme', 'ambiguous_reference');
});

test('rejects page URLs, repeated separators, and empty path segments', () => {
	assertReferenceError('https://github.com/getwinharris/agents/issues/35', 'unsupported_path');
	assertReferenceError('https://github.com//getwinharris/agents.git', 'unsupported_path');
	assertReferenceError('https://github.com/getwinharris//agents.git', 'unsupported_path');
	assertReferenceError('https://github.com/getwinharris/agents.git//', 'unsupported_path');
	assertReferenceError('git@github.com:getwinharris//agents.git', 'unsupported_path');
	assertReferenceError('git@github.com:getwinharris/agents.git//', 'unsupported_path');
});

test('rejects traversal, malformed identities, and ambiguous input', () => {
	assertReferenceError('https://github.com/getwinharris/%2e%2e', 'unsupported_path');
	assertReferenceError('https://github.com/-owner/agents', 'invalid_owner');
	assertReferenceError('https://github.com/owner--name/agents', 'invalid_owner');
	assertReferenceError('https://github.com/getwinharris/agents extra', 'ambiguous_reference');
	assertReferenceError('getwinharris/agents', 'invalid_url');
	assertReferenceError('', 'invalid_input');
});

function assertReferenceError(reference, code) {
	assert.throws(
		() => resolveGitHubRepositoryReference(reference),
		(error) => error instanceof GitHubRepositoryReferenceError && error.code === code,
	);
}
