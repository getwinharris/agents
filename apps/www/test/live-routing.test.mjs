import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const mediaHubPage = fs.readFileSync(
	new URL('../src/pages/mediahub/index.astro', import.meta.url),
	'utf8',
);
const styles = fs.readFileSync(new URL('../src/styles/bapx.css', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');

test('Media Hub services use a responsive owning class instead of an inline fixed grid', () => {
	assert.match(mediaHubPage, /class="page-section mediahub-services"/);
	assert.doesNotMatch(mediaHubPage, /grid-template-columns:\s*minmax\(300px/);
	assert.match(styles, /\.mediahub-services\s*\{[^}]*grid-template-columns:/s);
	assert.match(styles, /@media\s*\(max-width:\s*640px\)[\s\S]*\.mediahub-services\s*\{[^}]*grid-template-columns:\s*1fr/s);
});

test('the Node host router emits an HTTP redirect for the docs root', () => {
	assert.match(server, /host\s*===\s*'docs\.bapx\.in'/);
	assert.match(server, /urlPath\s*===\s*'\/'/);
	assert.match(server, /writeHead\(302,\s*\{\s*Location:\s*'https:\/\/docs\.bapx\.in\/getting-started\/quickstart\/'/s);
});
