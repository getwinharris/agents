#!/usr/bin/env node
/**
 * Prepares publish artifacts for the core packages (`@bapX/cli`,
 * `@bapX/runtime`, and `@bapX/sdk`):
 * - Copies `apps/docs/src/content/docs` into `<package>/docs` for agent consumption.
 * - Syncs the root README.md into each package.
 * - Embeds the `bapX docs` catalog into the installable Bapx skill.
 *
 * Run from anywhere: `node scripts/prepare-publish.mjs`
 */
import { execFile } from 'node:child_process';
import { copyFile, cp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const docsSource = join(repoRoot, 'apps/docs/src/content/docs');
const readmeSource = join(repoRoot, 'README.md');
const skillPath = join(repoRoot, 'skills/bapX/SKILL.md');
const catalogStart = '<!-- bapX-docs-catalog:start -->';
const catalogEnd = '<!-- bapX-docs-catalog:end -->';

const PUBLISH_ARTIFACT_PACKAGES = new Set(['@bapX/cli', '@bapX/runtime', '@bapX/sdk']);

export function embedDocsCatalog(skillSource, catalog) {
	const start = skillSource.indexOf(catalogStart);
	const end = skillSource.indexOf(catalogEnd);
	if (start === -1 || end === -1 || end < start) {
		throw new Error('Bapx skill is missing valid docs catalog markers.');
	}
	if (
		skillSource.indexOf(catalogStart, start + catalogStart.length) !== -1 ||
		skillSource.indexOf(catalogEnd, end + catalogEnd.length) !== -1
	) {
		throw new Error('Bapx skill must contain exactly one pair of docs catalog markers.');
	}
	const before = skillSource.slice(0, start + catalogStart.length);
	const after = skillSource.slice(end);
	return `${before}\n\n\`\`\`text\n${catalog.trimEnd()}\n\`\`\`\n\n${after}`;
}

export async function preparePublishArtifacts() {
	const packagesDir = join(repoRoot, 'packages');
	for (const entry of await readdir(packagesDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) {
			continue;
		}
		const packageRoot = join(packagesDir, entry.name);
		let manifest;
		try {
			manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
		} catch {
			continue;
		}
		const docsTarget = join(packageRoot, 'docs');
		await rm(docsTarget, { force: true, recursive: true });

		if (!PUBLISH_ARTIFACT_PACKAGES.has(manifest.name)) {
			continue;
		}

		await cp(docsSource, docsTarget, { recursive: true });
		await copyFile(readmeSource, join(packageRoot, 'README.md'));

		console.error(`[bapX] Prepared publish artifacts for ${manifest.name}`);
	}

	const cliPath = join(repoRoot, 'packages/cli/dist/bapX.js');
	const { stdout: catalog } = await execFileAsync(process.execPath, [cliPath, 'docs'], {
		cwd: repoRoot,
		maxBuffer: 10 * 1024 * 1024,
	});
	const skillSource = await readFile(skillPath, 'utf8');
	await writeFile(skillPath, embedDocsCatalog(skillSource, catalog));
	console.error('[bapX] Embedded the documentation catalog in skills/bapX/SKILL.md');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	await preparePublishArtifacts();
}
