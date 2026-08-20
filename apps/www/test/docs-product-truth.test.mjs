import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

const navigation = read('../src/lib/docs-navigation.ts');
const quickstart = read('../src/content/docs/getting-started/quickstart.md');
const agentConcept = read('../src/content/docs/concepts/agents.md');
const whyBapx = read('../src/content/docs/introduction/why-bapx.md');
const productSurfaces = read('../src/content/docs/introduction/product-surfaces.md');
const mcp = read('../src/content/docs/mcp/overview.md');
const sourceOwnership = read('../src/content/docs/reference/source-ownership.md');
const mobileNavigation = read('../src/components/docs/MobileDocsNavigation.astro');

test('public docs navigation exposes existing developer contracts', () => {
	assert.match(navigation, /key: 'developers'/);
	const developersSection = navigation.match(
		/key: 'developers'[\s\S]*?(?=\n\t\{\n\t\tkey: 'ecosystem')/,
	)?.[0];
	assert.ok(developersSection, 'Developers navigation section must remain present');
	for (const group of ['Reference', 'CLI', 'Runtime API', 'SDK']) {
		assert.match(developersSection, new RegExp(`title: '${group}'`));
	}

	const developerSlugs = [...developersSection.matchAll(/slug: '([^']+)'/g)].map(
		(match) => match[1],
	);
	assert.ok(
		developerSlugs.length > 30,
		'Developers navigation must expose all existing reference groups',
	);
	for (const slug of developerSlugs) {
		assert.ok(
			fs.existsSync(new URL(`../src/content/docs/${slug}.md`, import.meta.url)),
			`Developers navigation route is missing its published source: ${slug}`,
		);
	}
	assert.match(mobileNavigation, /flex-wrap/);
});

test('hosted product docs do not advertise incomplete self-service workflows', () => {
	assert.doesNotMatch(quickstart, /start a task or create a project agent/i);
	assert.doesNotMatch(quickstart, /Configure channels from Platform settings/i);
	assert.doesNotMatch(quickstart, /Add team members to your workspace/i);
	assert.match(agentConcept, /There is no supported instant `agents\.bapx\.in\/workspace\/<name>`/);
	assert.match(
		whyBapx,
		/Self-service provider credential management[\s\S]*are not yet complete public workflows/,
	);
});

test('shared API and MCP documentation states the live 404 boundary', () => {
	for (const page of [whyBapx, productSurfaces, mcp, sourceOwnership]) {
		assert.ok(
			page
				.split('\n')
				.some(
					(line) =>
						/api\.bapx\.in(?:\/mcp)?/i.test(line) &&
						/not served|returns? (?:HTTP )?404/i.test(line),
				),
			'API/MCP endpoint and its unavailable status must appear together',
		);
	}
});

test('MediaHub is documented as a separate custom-quote enterprise service', () => {
	assert.match(productSurfaces, /forward-deployed engineering/i);
	assert.match(productSurfaces, /commercially separate from the Agents subscription/i);
	assert.match(
		productSurfaces,
		/does not promise free compute, storage, model usage, or pooled provider quotas/i,
	);
});
