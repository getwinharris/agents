import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';

const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

describe('apps-www build graph', () => {
	it('declares the shared React dependency before invoking the nested Admin build', () => {
		assert.equal(packageJson.scripts.build, 'astro build && npm run build --workspace bapX-admin');
		assert.equal(packageJson.devDependencies['@bapX/react'], '*');
		assert.equal(packageJson.devDependencies['bapX-admin'], undefined);
	});
});
