import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsRoot = path.join(appRoot, 'dist', 'docs');

const readRoute = (slug) => fs.readFileSync(path.join(docsRoot, slug, 'index.html'), 'utf8');

const productSurfaces = readRoute('introduction/product-surfaces');
const quickstart = readRoute('getting-started/quickstart');
const developers = readRoute('sdk/overview');
const maintainerCli = readRoute('cli/overview');
const mcp = readRoute('mcp/overview');
const platformApi = readRoute('platform/api');
const platformMcp = readRoute('platform/mcp');

assert.match(
	productSurfaces,
	/href="https:\/\/docs\.bapx\.in\/sdk\/overview\/"[^>]*>Developers<\/a>/,
	'Developers must be reachable from the rendered top navigation',
);
assert.doesNotMatch(
	developers,
	/href="\/docs\/cli\//,
	'The internal bapX CLI must not appear in the public Developers navigation',
);

const developerRoutes = [
	...new Set([...developers.matchAll(/href="\/docs\/([^"#?]+)\/"/g)].map((match) => match[1])),
];
assert.ok(developerRoutes.length > 20, 'Rendered Developers navigation is incomplete');
for (const slug of developerRoutes) {
	assert.ok(
		fs.existsSync(path.join(docsRoot, slug, 'index.html')),
		`Rendered Developers link has no built route: ${slug}`,
	);
}

// The gateway is served now, so the old "returns HTTP 404" assertions enforced a
// claim that had become false. The invariant worth guarding is the one that is
// still true and easy to overclaim: requests are forwarded to an operator-run
// plane on a shared credential, so no page may present per-business provider
// routing, per-business model scoping, or revocation-affects-/v1/models as
// shipped. Re-point these at the real behaviour when that lands.
// Matching every phrasing of the claim is not workable — a correct future-tense
// sentence ("once per-business routing ships it will return only the models you
// connected") contains the same words as the false present-tense one. So guard
// two precise things instead: the disclaimer must be present on both pages that
// document the endpoint, and the specific unqualified present-tense sentences
// that were shipped and were false must not come back.
for (const [name, page] of [
	['platform/api', platformApi],
	['platform/mcp', platformMcp],
]) {
	assert.match(
		page,
		/operator-run/i,
		`${name} must state that calls run on the operator-run plane; per-business provider routing is not wired`,
	);
}
for (const [name, page] of [
	['platform/api', platformApi],
	['platform/mcp', platformMcp],
	['product-surfaces', productSurfaces],
	['mcp/overview', mcp],
]) {
	assert.doesNotMatch(
		page,
		/returns only the models reachable through the providers your business has actually connected/i,
		`${name} states per-business model scoping as current behaviour; it is not wired`,
	);
	assert.doesNotMatch(
		page,
		/Revoking a provider connection immediately removes those models/i,
		`${name} states revocation affects \/v1\/models today; it does not`,
	);
}
assert.match(productSurfaces, /MediaHub[\s\S]{0,600}custom-quote/i);
assert.doesNotMatch(productSurfaces, /\/root\/bapx\.in/);
assert.doesNotMatch(quickstart, /\/docs\/cli\//);
assert.doesNotMatch(quickstart, /start a task or create a project agent/i);
assert.doesNotMatch(quickstart, /Configure channels from Platform settings/i);
assert.doesNotMatch(quickstart, /Add team members to your workspace/i);
assert.match(maintainerCli, /internal[\s\S]{0,400}not an external customer workflow/i);
assert.doesNotMatch(maintainerCli, /npm install --save-dev @bapX\/cli/);

// There is no scoped "agent" package. The runtime ships as `@bapX/runtime` and CLI operations
// as `@bapX/cli`; guard against the invented package name returning to public documentation.
const inventedPackage = /@bapx\/agent/i;
const renderedDocs = fs
	.readdirSync(docsRoot, { recursive: true })
	.filter((entry) => typeof entry === 'string' && entry.endsWith('.html'));
for (const entry of renderedDocs) {
	assert.doesNotMatch(
		fs.readFileSync(path.join(docsRoot, entry), 'utf8'),
		inventedPackage,
		`Rendered documentation references a nonexistent scoped agent package: ${entry}. ` +
			'Use @bapX/runtime for the harness and runtime, or @bapX/cli for operations tooling.',
	);
}

console.log(
	`validated rendered documentation: ${developerRoutes.length} Developers links resolve, ` +
		`${renderedDocs.length} rendered pages free of the invented agent package name`,
);
