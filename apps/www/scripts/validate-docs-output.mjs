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

assert.match(productSurfaces, /api\.bapx\.in[\s\S]{0,600}HTTP 404/i);
assert.match(mcp, /api\.bapx\.in\/mcp[\s\S]{0,600}HTTP 404/i);
assert.match(productSurfaces, /MediaHub[\s\S]{0,600}custom-quote/i);
assert.doesNotMatch(productSurfaces, /\/root\/bapx\.in/);
assert.doesNotMatch(quickstart, /\/docs\/cli\//);
assert.doesNotMatch(quickstart, /start a task or create a project agent/i);
assert.doesNotMatch(quickstart, /Configure channels from Platform settings/i);
assert.doesNotMatch(quickstart, /Add team members to your workspace/i);
assert.match(maintainerCli, /internal[\s\S]{0,400}not an external customer workflow/i);
assert.doesNotMatch(maintainerCli, /npm install --save-dev @bapX\/cli/);

console.log(`validated rendered documentation: ${developerRoutes.length} Developers links resolve`);
