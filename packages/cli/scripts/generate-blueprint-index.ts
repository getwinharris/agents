#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../../..');
const blueprintsDir = join(repoRoot, 'blueprints');
const outFile = join(here, '../bin/_blueprints.generated.ts');

interface FrontmatterCommon {
	kind: string;
}
interface FrontmatterBlueprint extends FrontmatterCommon {
	website: string;
	aliases: string[];
	root?: undefined;
}
interface FrontmatterRoot extends FrontmatterCommon {
	root: true;
}
type Frontmatter = FrontmatterBlueprint | FrontmatterRoot;

interface BlueprintRecord {
	slug: string;
	kind: string;
	website: string;
	aliases: string[];
	file: string;
}
interface KindRootRecord {
	kind: string;
	file: string;
}

function parseFrontmatter(source: string, file: string): Frontmatter {
	if (!source.startsWith('---\n')) {
		throw new Error(`[blueprints] ${file}: missing JSON frontmatter (file must start with '---').`);
	}
	const end = source.indexOf('\n---\n', 4);
	if (end < 0) {
		throw new Error(`[blueprints] ${file}: frontmatter is not closed (no trailing '---').`);
	}
	const json = source.slice(4, end).trim();
	let parsed: any;
	try {
		parsed = JSON.parse(json);
	} catch (err) {
		throw new Error(
			`[blueprints] ${file}: frontmatter is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
	if (!parsed || typeof parsed !== 'object') {
		throw new Error(`[blueprints] ${file}: frontmatter must be a JSON object.`);
	}
	if (typeof parsed.kind !== 'string' || !parsed.kind) {
		throw new Error(`[blueprints] ${file}: frontmatter missing required string field "kind".`);
	}
	if (parsed.root === true) {
		return { kind: parsed.kind, root: true };
	}
	if (typeof parsed.website !== 'string' || !parsed.website) {
		throw new Error(
			`[blueprints] ${file}: frontmatter missing required string field "website" (or set "root": true for a kind root).`,
		);
	}
	let aliases: string[] = [];
	if ('aliases' in parsed && parsed.aliases !== undefined) {
		if (!Array.isArray(parsed.aliases)) {
			throw new Error(
				`[blueprints] ${file}: frontmatter "aliases" must be an array of strings if present.`,
			);
		}
		for (const alias of parsed.aliases) {
			if (typeof alias !== 'string' || !alias.trim()) {
				throw new Error(
					`[blueprints] ${file}: frontmatter "aliases" must contain only non-empty strings.`,
				);
			}
		}
		aliases = parsed.aliases;
	}
	return { kind: parsed.kind, website: parsed.website, aliases };
}

async function main() {
	const allFiles = (await readdir(blueprintsDir))
		.filter((file) => file.endsWith('.md') && file !== 'README.md')
		.sort();

	const blueprints: BlueprintRecord[] = [];
	const kindRoots: KindRootRecord[] = [];
	const seenNames = new Map<string, string>();

	for (const file of allFiles) {
		const stem = file.slice(0, -'.md'.length);
		const dashIndex = stem.indexOf('--');
		const source = await readFile(join(blueprintsDir, file), 'utf-8');
		const frontmatter = parseFrontmatter(source, file);

		if (dashIndex >= 0) {
			if (frontmatter.root) {
				throw new Error(
					`[blueprints] ${file}: filename uses '--' separator but frontmatter has "root": true. Kind roots use the bare filename "<kind>.md".`,
				);
			}
			const kind = stem.slice(0, dashIndex);
			const slug = stem.slice(dashIndex + 2);
			if (kind !== frontmatter.kind) {
				throw new Error(
					`[blueprints] ${file}: filename kind "${kind}" does not match frontmatter kind "${frontmatter.kind}".`,
				);
			}
			const normalizedSlug = slug.toLowerCase();
			if (seenNames.has(normalizedSlug)) {
				throw new Error(
					`[blueprints] name collision: both "${seenNames.get(normalizedSlug)}" and "${file}" resolve to "${slug}". Rename one.`,
				);
			}
			seenNames.set(normalizedSlug, file);
			for (const alias of frontmatter.aliases) {
				const normalizedAlias = alias.toLowerCase();
				if (normalizedAlias === normalizedSlug) {
					throw new Error(
						`[blueprints] ${file}: alias "${alias}" duplicates the blueprint's own slug. Remove it from "aliases".`,
					);
				}
				if (seenNames.has(normalizedAlias)) {
					throw new Error(
						`[blueprints] name collision: alias "${alias}" in ${file} is already taken by ${seenNames.get(normalizedAlias)}.`,
					);
				}
				seenNames.set(normalizedAlias, file);
			}
			blueprints.push({
				slug,
				kind,
				website: frontmatter.website,
				aliases: frontmatter.aliases,
				file,
			});
		} else {
			if (!frontmatter.root) {
				throw new Error(
					`[blueprints] ${file}: bare-named file (no '--') must declare "root": true in frontmatter.`,
				);
			}
			if (stem !== frontmatter.kind) {
				throw new Error(
					`[blueprints] ${file}: filename "${stem}" does not match frontmatter kind "${frontmatter.kind}". Kind roots must be named "<kind>.md".`,
				);
			}
			const normalizedStem = stem.toLowerCase();
			if (seenNames.has(normalizedStem)) {
				throw new Error(
					`[blueprints] name collision: "${seenNames.get(normalizedStem)}" already uses "${stem}".`,
				);
			}
			seenNames.set(normalizedStem, file);
			kindRoots.push({ kind: frontmatter.kind, file });
		}
	}

	const banner = `// AUTO-GENERATED by scripts/generate-blueprint-index.ts. Do not edit by hand.\n`;
	const blueprintsLiteral = blueprints
		.map(
			(blueprint) =>
				`\t{ slug: ${JSON.stringify(blueprint.slug)}, kind: ${JSON.stringify(blueprint.kind)}, website: ${JSON.stringify(blueprint.website)}, aliases: ${JSON.stringify(blueprint.aliases)} },`,
		)
		.join('\n');
	const rootsLiteral = kindRoots
		.map((root) => `\t{ kind: ${JSON.stringify(root.kind)} },`)
		.join('\n');
	const out =
		banner +
		`export const BLUEPRINTS: readonly { readonly slug: string; readonly kind: string; readonly website: string; readonly aliases: readonly string[] }[] = [\n${blueprintsLiteral}\n];\n\n` +
		`export const KIND_ROOTS: readonly { readonly kind: string }[] = [\n${rootsLiteral}\n];\n`;

	await mkdir(dirname(outFile), { recursive: true });
	await writeFile(outFile, out, 'utf-8');
	console.error(
		`[blueprints] wrote ${outFile} (${blueprints.length} blueprints, ${kindRoots.length} kind roots)`,
	);
}

main().catch((err) => {
	console.error(err instanceof Error ? err.message : String(err));
	process.exit(1);
});
