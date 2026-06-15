/**
 * Serves blueprint implementation guides for `flue add <kind> <name>` and
 * `flue add <kind> <url>`.
 *
 * Source-of-truth files live in the repository's top-level `blueprints/`
 * directory. Named blueprints use `<kind>--<name>.md`; generic kind guides use
 * `<kind>.md` with `"root": true` frontmatter.
 *
 * Filename-to-slug derivation is mirrored in
 * `packages/cli/scripts/generate-blueprint-index.ts`.
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const blueprintsDir = join(process.cwd(), '../../blueprints');

interface BlueprintEntry {
	slug: string;
	file: string;
}

async function listBlueprintEntries(): Promise<BlueprintEntry[]> {
	const files = (await readdir(blueprintsDir)).filter(
		(file) => file.endsWith('.md') && file !== 'README.md',
	);
	const entries: BlueprintEntry[] = [];
	for (const file of files) {
		const stem = file.slice(0, -'.md'.length);
		const dashIndex = stem.indexOf('--');
		entries.push({
			slug: dashIndex >= 0 ? stem.slice(dashIndex + 2) : stem,
			file,
		});
	}
	return entries;
}

export const getStaticPaths: GetStaticPaths = async () => {
	const entries = await listBlueprintEntries();
	return entries.map(({ slug }) => ({ params: { name: slug } }));
};

function stripFrontmatter(source: string): string {
	if (!source.startsWith('---\n')) return source;
	const end = source.indexOf('\n---\n', 4);
	if (end < 0) return source;
	return source.slice(end + '\n---\n'.length).replace(/^\n+/, '');
}

export const GET: APIRoute = async ({ params }) => {
	const name = params.name;
	if (!name) {
		return new Response('Not found', { status: 404 });
	}

	const entries = await listBlueprintEntries();
	const entry = entries.find(({ slug }) => slug === name);
	if (!entry) {
		return new Response(`Blueprint "${name}" not found.`, {
			status: 404,
			headers: { 'Content-Type': 'text/plain; charset=utf-8' },
		});
	}

	const raw = await readFile(join(blueprintsDir, entry.file), 'utf-8');
	const body = stripFrontmatter(raw);

	return new Response(body, {
		headers: {
			'Content-Type': 'text/markdown; charset=utf-8',
		},
	});
};
