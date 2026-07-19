import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const projectsPage = fs.readFileSync(
	new URL('../admin/src/components/projects-page.tsx', import.meta.url),
	'utf8',
);

test('distinguishes loading, failed, empty, and ready project-list states', () => {
	assert.match(projectsPage, /aria-busy=\{projectsLoading\}/);
	assert.match(projectsPage, /projectsLoading[\s\S]*data-state="loading"/);
	assert.match(projectsPage, /projectsLoadError[\s\S]*role="alert"[\s\S]*data-state="error"/);
	assert.match(projectsPage, /projects\.length === 0[\s\S]*data-state="empty"/);
	assert.match(projectsPage, /data-state="ready"[\s\S]*projects\.map/);
});

test('does not report an empty workspace before the listing request settles', () => {
	assert.match(
		projectsPage,
		/projectsLoading\s*\?\s*\([\s\S]*\)\s*:\s*projectsLoadError\s*\?\s*\([\s\S]*\)\s*:\s*projects\.length === 0\s*\?/,
	);
});
