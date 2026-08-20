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
	assert.match(navigation, /slug: 'cli\/overview'/);
	assert.match(navigation, /slug: 'api\/agent-api'/);
	assert.match(navigation, /slug: 'sdk\/overview'/);
	assert.match(navigation, /slug: 'reference\/configuration'/);
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
		assert.match(page, /not served|returns? (?:HTTP )?404/i);
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
