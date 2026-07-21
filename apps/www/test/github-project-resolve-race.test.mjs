import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const componentPath = path.resolve(testDirectory, '../admin/src/components/projects-page.tsx');

function deferred() {
	let resolve;
	let reject;
	const promise = new Promise((nextResolve, nextReject) => {
		resolve = nextResolve;
		reject = nextReject;
	});
	return { promise, resolve, reject };
}

function compileProjectsPageLogic() {
	const source = fs.readFileSync(componentPath, 'utf8');
	const withoutImports = source.replace(/^import .*$/gm, '');
	const componentStart = withoutImports.indexOf('export function ProjectsPage()');
	const renderStart = withoutImports.indexOf('\n  return (', componentStart);
	assert.notEqual(componentStart, -1, 'ProjectsPage export must exist');
	assert.notEqual(renderStart, -1, 'ProjectsPage render boundary must exist');

	const logic = `${withoutImports
		.slice(componentStart, renderStart)
		.replace('export function ProjectsPage()', 'function ProjectsPage()')}\n
  globalThis.__projectsPageHarness = {
    updateRepositoryUrl,
    resolveRepository,
    snapshot: () => ({ repositoryUrl, projectSlug, resolved, confirmed, status, resolving, loading }),
  }
  return null
}
ProjectsPage()
`;

	return ts.transpileModule(logic, {
		compilerOptions: {
			target: ts.ScriptTarget.ES2022,
			module: ts.ModuleKind.None,
		},
	}).outputText;
}

function createProjectsPageHarness() {
	const compiled = compileProjectsPageLogic();
	const states = [];
	const refs = [];
	let stateCursor = 0;
	let refCursor = 0;
	let fetchImplementation = async () => ({ ok: true, json: async () => ({ projects: [] }) });

	const context = vm.createContext({
		AbortController,
		DOMException,
		Error,
		Promise,
		console,
		fetch: (...args) => fetchImplementation(...args),
		setTimeout,
		clearTimeout,
		useEffect: () => undefined,
		useState(initialValue) {
			const index = stateCursor++;
			if (!(index in states)) states[index] = initialValue;
			return [states[index], (value) => {
				states[index] = typeof value === 'function' ? value(states[index]) : value;
			}];
		},
		useRef(initialValue) {
			const index = refCursor++;
			if (!(index in refs)) refs[index] = { current: initialValue };
			return refs[index];
		},
	});
	const script = new vm.Script(compiled, { filename: componentPath });

	function render() {
		stateCursor = 0;
		refCursor = 0;
		script.runInContext(context);
		return context.__projectsPageHarness;
	}

	return {
		render,
		setFetch(implementation) {
			fetchImplementation = implementation;
		},
	};
}

function resolvedRepository(fullName, slug) {
	const [owner, repository] = fullName.split('/');
	return {
		repository: {
			owner,
			repository,
			fullName,
			httpsUrl: `https://github.com/${fullName}.git`,
			sshUrl: `git@github.com:${fullName}.git`,
		},
		metadata: {
			repositoryId: 1,
			fullName,
			ownerType: 'User',
			defaultBranch: 'main',
			visibility: 'public',
			private: false,
			archived: false,
			status: 'available',
		},
		project: { slug, path: `projects/${slug}` },
	};
}

function jsonResponse(body, ok = true) {
	return { ok, json: async () => body };
}

test('actual ProjectsPage logic rejects a late success after the input changes', async () => {
	const pending = deferred();
	const page = createProjectsPageHarness();
	let view = page.render();
	view.updateRepositoryUrl('https://github.com/example/repository-a');
	view = page.render();
	page.setFetch(() => pending.promise.then((body) => jsonResponse(body)));
	const resolution = view.resolveRepository();

	view = page.render();
	view.updateRepositoryUrl('https://github.com/example/repository-b');
	pending.resolve(resolvedRepository('example/repository-a', 'repository-a'));
	await resolution;

	const state = page.render().snapshot();
	assert.equal(state.repositoryUrl, 'https://github.com/example/repository-b');
	assert.equal(state.resolved, null);
	assert.equal(state.projectSlug, '');
	assert.equal(state.confirmed, false);
	assert.equal(state.status, null);
	assert.equal(state.resolving, false);
});

test('actual ProjectsPage logic rejects a late failure after the input changes', async () => {
	const pending = deferred();
	const page = createProjectsPageHarness();
	let view = page.render();
	view.updateRepositoryUrl('https://github.com/example/repository-a');
	view = page.render();
	page.setFetch(() => pending.promise);
	const resolution = view.resolveRepository();

	view = page.render();
	view.updateRepositoryUrl('https://github.com/example/repository-b');
	pending.reject(new Error('repository A failed'));
	await resolution;

	const state = page.render().snapshot();
	assert.equal(state.repositoryUrl, 'https://github.com/example/repository-b');
	assert.equal(state.resolved, null);
	assert.equal(state.projectSlug, '');
	assert.equal(state.status, null);
	assert.equal(state.resolving, false);
});

test('actual ProjectsPage logic allows only the current request to publish and clear loading', async () => {
	const first = deferred();
	const second = deferred();
	const requests = [first, second];
	const page = createProjectsPageHarness();
	let view = page.render();
	view.updateRepositoryUrl('https://github.com/example/repository-a');
	view = page.render();
	page.setFetch(() => requests.shift().promise.then((body) => jsonResponse(body)));
	const firstResolution = view.resolveRepository();

	view = page.render();
	view.updateRepositoryUrl('https://github.com/example/repository-b');
	view = page.render();
	const secondResolution = view.resolveRepository();
	first.resolve(resolvedRepository('example/repository-a', 'repository-a'));
	await firstResolution;

	let state = page.render().snapshot();
	assert.equal(state.resolving, true);
	assert.equal(state.resolved, null);

	second.resolve(resolvedRepository('example/repository-b', 'repository-b'));
	await secondResolution;
	state = page.render().snapshot();
	assert.equal(state.resolving, false);
	assert.equal(state.resolved.repository.fullName, 'example/repository-b');
	assert.equal(state.projectSlug, 'repository-b');
	assert.equal(state.confirmed, false);
	assert.equal(state.status.kind, 'success');
	assert.match(state.status.message, /example\/repository-b/);
});
