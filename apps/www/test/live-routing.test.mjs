import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const mediaHubPage = fs.readFileSync(
	new URL('../src/pages/mediahub/index.astro', import.meta.url),
	'utf8',
);
const styles = fs.readFileSync(new URL('../src/styles/bapx.css', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');

test('Media Hub owns a responsive studio funnel and first-party lead submission', () => {
	assert.match(mediaHubPage, /class="studio-service-list"/);
	assert.match(mediaHubPage, /id="mediahub-inquiry"/);
	assert.match(mediaHubPage, /fetch\('\/api\/mediahub\/inquiries'/);
	assert.match(mediaHubPage, /mediahub_lead_submitted/);
	assert.match(styles, /\.studio-services-grid\s*\{[^}]*grid-template-columns:/s);
	assert.match(styles, /@media\s*\(max-width:\s*720px\)[\s\S]*\.studio-brief-form\s*\{\s*grid-template-columns:\s*1fr/s);
});

test('the Node host router emits an HTTP redirect for the docs root', () => {
	assert.match(server, /host\s*===\s*'docs\.bapx\.in'/);
	assert.match(server, /urlPath\s*===\s*'\/'/);
	assert.match(server, /writeHead\(302,\s*\{\s*Location:\s*'https:\/\/docs\.bapx\.in\/getting-started\/quickstart\/'/s);
});
