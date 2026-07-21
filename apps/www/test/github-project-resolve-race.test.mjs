import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));

function deferred() {
	let resolve;
	let reject;
	const promise = new Promise((nextResolve, nextReject) => {
		resolve = nextResolve;
		reject = nextReject;
	});
	return { promise, resolve, reject };
}

function createResolutionHarness() {
	let requestId = 0;
	let activeController = null;
	const state = {
		repositoryUrl: '',
		resolved: null,
		projectSlug: '',
		confirmed: false,
		status: null,
		resolving: false,
	};

	function updateRepositoryUrl(value) {
		requestId += 1;
		activeController?.abort();
		activeController = null;
		state.resolving = false;
		state.repositoryUrl = value;
		state.resolved = null;
		state.projectSlug = '';
		state.confirmed = false;
		state.status = null;
	}

	async function resolveRepository(fetchRepository) {
		const submittedRepositoryUrl = state.repositoryUrl.trim();
		if (state.resolving || !submittedRepositoryUrl) return;

		const currentRequestId = requestId + 1;
		requestId = currentRequestId;
		const controller = new AbortController();
		activeController?.abort();
		activeController = controller;
		state.resolving = true;
		state.resolved = null;
		state.confirmed = false;
		state.status = { kind: 'progress', message: 'resolving' };

		try {
			const next = await fetchRepository({ repositoryUrl: submittedRepositoryUrl, signal: controller.signal });
			if (currentRequestId !== requestId) return;
			state.resolved = next;
			state.projectSlug = next.project.slug;
			state.status = { kind: 'success', message: next.repository.fullName };
		} catch (error) {
			if (currentRequestId !== requestId || (error instanceof DOMException && error.name === 'AbortError')) return;
			state.status = { kind: 'error', message: error instanceof Error ? error.message : 'failed' };
		} finally {
			if (currentRequestId === requestId) {
				activeController = null;
				state.resolving = false;
			}
		}
	}

	return { state, updateRepositoryUrl, resolveRepository };
}

function resolvedRepository(fullName, slug) {
	return {
		repository: { fullName },
		project: { slug },
	};
}

test('late success cannot restore a repository after the input changes', async () => {
	const pending = deferred();
	const harness = createResolutionHarness();
	harness.updateRepositoryUrl('https://github.com/example/repository-a');
	const resolution = harness.resolveRepository(() => pending.promise);

	harness.updateRepositoryUrl('https://github.com/example/repository-b');
	pending.resolve(resolvedRepository('example/repository-a', 'repository-a'));
	await resolution;

	assert.equal(harness.state.repositoryUrl, 'https://github.com/example/repository-b');
	assert.equal(harness.state.resolved, null);
	assert.equal(harness.state.projectSlug, '');
	assert.equal(harness.state.confirmed, false);
	assert.equal(harness.state.status, null);
	assert.equal(harness.state.resolving, false);
});

test('late failure cannot replace the cleared state after the input changes', async () => {
	const pending = deferred();
	const harness = createResolutionHarness();
	harness.updateRepositoryUrl('https://github.com/example/repository-a');
	const resolution = harness.resolveRepository(() => pending.promise);

	harness.updateRepositoryUrl('https://github.com/example/repository-b');
	pending.reject(new Error('repository A failed'));
	await resolution;

	assert.equal(harness.state.repositoryUrl, 'https://github.com/example/repository-b');
	assert.equal(harness.state.resolved, null);
	assert.equal(harness.state.projectSlug, '');
	assert.equal(harness.state.status, null);
	assert.equal(harness.state.resolving, false);
});

test('only the current request may publish success and clear loading', async () => {
	const first = deferred();
	const second = deferred();
	const harness = createResolutionHarness();
	harness.updateRepositoryUrl('https://github.com/example/repository-a');
	const firstResolution = harness.resolveRepository(() => first.promise);

	harness.updateRepositoryUrl('https://github.com/example/repository-b');
	const secondResolution = harness.resolveRepository(() => second.promise);
	first.resolve(resolvedRepository('example/repository-a', 'repository-a'));
	await firstResolution;

	assert.equal(harness.state.resolving, true);
	assert.equal(harness.state.resolved, null);

	second.resolve(resolvedRepository('example/repository-b', 'repository-b'));
	await secondResolution;

	assert.equal(harness.state.resolving, false);
	assert.equal(harness.state.resolved.repository.fullName, 'example/repository-b');
	assert.equal(harness.state.projectSlug, 'repository-b');
	assert.deepEqual(harness.state.status, { kind: 'success', message: 'example/repository-b' });
});

test('the Admin component wires the same request identity and abort boundaries exercised above', () => {
	const source = fs.readFileSync(path.resolve(testDirectory, '../admin/src/components/projects-page.tsx'), 'utf8');
	assert.match(source, /const resolveRequestId = useRef\(0\)/);
	assert.match(source, /updateRepositoryUrl[\s\S]*resolveRequestId\.current \+= 1[\s\S]*resolveAbortController\.current\?\.abort\(\)/);
	assert.match(source, /const requestId = resolveRequestId\.current \+ 1/);
	assert.match(source, /if \(requestId !== resolveRequestId\.current\) return/);
	assert.match(source, /requestId === resolveRequestId\.current[\s\S]*setResolving\(false\)/);
});
