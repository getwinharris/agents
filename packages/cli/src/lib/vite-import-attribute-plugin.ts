import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PackagedSkillDirectory } from '@bapX/runtime';
import { buildPackagedSkill, parseSkillMarkdown } from '@bapX/runtime/internal';
import { normalizePath, type Plugin, transformWithOxc } from 'vite';

const MARKDOWN_MODULE_PREFIX = '\0bapX-markdown:';
const SKILL_MODULE_PREFIX = '\0bapX-skill:';
const ENCODED_SKILL_MODULE_PREFIX = '__x00__bapX-skill:';
const PACKAGED_FILE_WARNING_BYTES = 1024 * 1024;
const EXCLUDED_DIRECTORIES = new Set([
	'.git',
	'.cache',
	'.turbo',
	'.wrangler',
	'dist',
	'node_modules',
]);
const SENSITIVE_DIRECTORIES = new Set(['.aws', '.gnupg', '.ssh']);
const EXCLUDED_FILES = new Set(['.netrc', '.npmrc', '.pypirc', '_netrc', 'credentials.json']);
const SENSITIVE_FILE_PATTERNS = [/\.key$/i, /\.pem$/i, /\.p12$/i, /\.pfx$/i, /^secrets?(?:\.|$)/i];

/**
 * Handles Bapx's attributed imports — `with { type: 'markdown' }` and
 * `with { type: 'skill' }` — in one plugin so each module in the graph is
 * type-stripped and parsed once per (re)build, and so the two attribute
 * types cannot drift apart.
 */
export function importAttributePlugin(): Plugin {
	let viteRoot = '';
	const internalModuleToken = randomUUID();
	const internalSkillModulePrefix = `${SKILL_MODULE_PREFIX}${internalModuleToken}:`;
	const encodedInternalSkillModulePrefix = `__x00__bapX-skill:${internalModuleToken}:`;
	const trackedSkillDirectories = new Set<string>();

	return {
		name: 'bapX-import-attributes',
		enforce: 'pre',
		configResolved(config) {
			viteRoot = config.root;
		},
		async transform(code, id) {
			if (!/\.[cm]?[jt]sx?(?:\?|$)/i.test(id)) return null;
			const importerPath = id.split('?')[0] ?? id;
			const parseableCode = /\.[cm]?tsx?(?:\?|$)/i.test(id)
				? (await transformWithOxc(code, importerPath, {})).code
				: code;
			const ast = this.parse(parseableCode) as unknown as ModuleAst;
			assertNoDynamicSkillImports(ast);
			const markdownImports = collectAttributedImports(ast, 'markdown');
			const skillImports = collectAttributedImports(ast, 'skill');
			if (markdownImports.length === 0 && skillImports.length === 0) return null;
			const replacements: Array<AttributedImport & { moduleId: string }> = [];
			for (const declaration of markdownImports) {
				if (isSkillMarkdownPath(declaration.specifier)) {
					throw new Error(
						`[bapX] SKILL.md imports must use an import attribute: with { type: 'skill' }.`,
					);
				}
				if (!/\.md$/i.test(declaration.specifier)) {
					throw new Error(
						`[bapX] Markdown imports must target a .md file: ${declaration.specifier}`,
					);
				}
				const rootRelativePath = declaration.specifier.startsWith('/')
					? path.resolve(viteRoot, declaration.specifier.slice(1))
					: undefined;
				const resolved = rootRelativePath
					? { id: rootRelativePath, external: false }
					: await this.resolve(declaration.specifier, importerPath, { skipSelf: true });
				if (!resolved || resolved.external) {
					throw new Error(`[bapX] Unable to resolve markdown import: ${declaration.specifier}`);
				}
				if (isSkillMarkdownPath(resolved.id)) {
					throw new Error(
						`[bapX] SKILL.md imports must use an import attribute: with { type: 'skill' }.`,
					);
				}
				replacements.push({ ...declaration, moduleId: `${MARKDOWN_MODULE_PREFIX}${resolved.id}` });
			}
			for (const declaration of skillImports) {
				if (!isSkillMarkdownPath(declaration.specifier)) {
					throw new Error(
						`[bapX] Skill imports must target a SKILL.md file: ${declaration.specifier}`,
					);
				}
				const resolved = await this.resolve(declaration.specifier, importerPath, {
					skipSelf: true,
				});
				if (!resolved || resolved.external) {
					throw new Error(`[bapX] Unable to resolve skill import: ${declaration.specifier}`);
				}
				const filesystemPath = stripQueryAndHash(resolved.id);
				if (!path.isAbsolute(filesystemPath)) {
					throw new Error(
						`[bapX] Skill imports must resolve to a filesystem path: ${declaration.specifier}`,
					);
				}
				const resolvedPath = canonicalPath(filesystemPath);
				if (!isSkillMarkdownPath(resolvedPath)) {
					throw new Error(
						`[bapX] Skill imports must resolve to a SKILL.md file: ${declaration.specifier}`,
					);
				}
				replacements.push({
					...declaration,
					moduleId: `${internalSkillModulePrefix}${resolvedPath}`,
				});
			}
			let transformed = parseableCode;
			for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
				transformed = `${transformed.slice(0, replacement.start)}${JSON.stringify(replacement.moduleId)}${transformed.slice(replacement.end)}`;
			}
			return { code: transformed, map: null };
		},
		resolveId(source, importer) {
			if (source.startsWith(MARKDOWN_MODULE_PREFIX)) return source;
			const internalModuleId = decodeSkillModuleId(
				source,
				internalSkillModulePrefix,
				encodedInternalSkillModulePrefix,
			);
			if (internalModuleId) return internalModuleId;
			if (source.startsWith(SKILL_MODULE_PREFIX) || source.includes(ENCODED_SKILL_MODULE_PREFIX)) {
				throw new Error(
					"[bapX] Internal packaged-skill module IDs cannot be imported directly. Use a static SKILL.md import with { type: 'skill' }.",
				);
			}
			if (!importer) return null;
			if (isSkillMarkdownPath(source)) {
				throw new Error(
					`[bapX] Markdown import "${source}" must use an import attribute: with { type: 'skill' }.`,
				);
			}
			return null;
		},
		hotUpdate(options) {
			const changedPath = canonicalPath(options.file);

			const directory = [...trackedSkillDirectories].find((trackedDirectory) =>
				isWithinDirectory(changedPath, trackedDirectory),
			);
			if (directory) {
				const skillPath = `${directory}/SKILL.md`;
				const modules = [
					this.environment.moduleGraph.getModuleById(`${internalSkillModulePrefix}${skillPath}`),
				].filter((module) => module !== undefined);
				for (const module of modules) this.environment.moduleGraph.invalidateModule(module);
				return modules;
			}
		},
		async load(id) {
			if (id.startsWith(MARKDOWN_MODULE_PREFIX)) {
				const markdownPath = id.slice(MARKDOWN_MODULE_PREFIX.length);
				this.addWatchFile(markdownPath);
				return `export default ${JSON.stringify(await fs.promises.readFile(markdownPath, 'utf8'))};`;
			}
			if (!id.startsWith(internalSkillModulePrefix)) return null;
			const skillPath = id.slice(internalSkillModulePrefix.length);
			const directory = path.dirname(skillPath);
			trackedSkillDirectories.add(canonicalPath(directory));
			const packagedSkill = await packageSkill(skillPath);
			return [
				`import { createSkillReference } from '@bapX/runtime/internal';`,
				`const directory = ${JSON.stringify(packagedSkill)};`,
				'export default createSkillReference(directory);',
			].join('\n');
		},
	};
}

async function packageSkill(skillPath: string): Promise<PackagedSkillDirectory> {
	const directory = path.dirname(skillPath);
	const parsed = parseSkillMarkdown(await fs.promises.readFile(skillPath, 'utf8'), {
		directoryName: path.basename(directory),
		path: skillPath,
	});
	const files = [];
	for (const filePath of await collectFiles(directory)) {
		const content = await fs.promises.readFile(filePath);
		if (content.byteLength > PACKAGED_FILE_WARNING_BYTES) {
			console.warn(
				`[bapX] Skill file "${filePath}" exceeds 1MB and will be packaged into the deployed application for lazy access.`,
			);
		}
		files.push({
			path: normalizePath(path.relative(directory, filePath)),
			content: new Uint8Array(content),
		});
	}
	return buildPackagedSkill({ name: parsed.name, description: parsed.description, files });
}

function canonicalPath(filePath: string): string {
	let unresolvedPath = filePath;
	const suffixes: string[] = [];
	while (!fs.existsSync(unresolvedPath)) {
		const parentPath = path.dirname(unresolvedPath);
		if (parentPath === unresolvedPath) return normalizePath(filePath);
		suffixes.unshift(path.basename(unresolvedPath));
		unresolvedPath = parentPath;
	}
	return normalizePath(path.join(fs.realpathSync.native(unresolvedPath), ...suffixes));
}

function isWithinDirectory(filePath: string, directory: string): boolean {
	return filePath === directory || filePath.startsWith(`${directory}/`);
}

async function collectFiles(directory: string, skillRoot = directory): Promise<string[]> {
	const files: string[] = [];
	for (const entry of await fs.promises.readdir(directory, { withFileTypes: true })) {
		const absolutePath = path.join(directory, entry.name);
		const relativePath = normalizePath(path.relative(skillRoot, absolutePath));
		if (entry.isSymbolicLink()) {
			throw new Error(
				`[bapX] Skill directory "${skillRoot}" contains symbolic link "${relativePath}", which cannot be packaged. Replace it with a regular file or directory.`,
			);
		}
		if (entry.isDirectory()) {
			if (EXCLUDED_DIRECTORIES.has(entry.name)) {
				console.warn(
					`[bapX] Excluding skill directory "${relativePath}" from the deployed application package because it is generated or repository metadata.`,
				);
				continue;
			}
			if (SENSITIVE_DIRECTORIES.has(entry.name.toLowerCase())) {
				throw new Error(
					`[bapX] Imported skill directory "${skillRoot}" contains sensitive directory "${relativePath}", which cannot be packaged. Remove credentials and private keys from the skill directory.`,
				);
			}
			files.push(...(await collectFiles(absolutePath, skillRoot)));
		} else if (entry.isFile()) {
			if (isSensitiveFile(entry.name)) {
				throw new Error(
					`[bapX] Imported skill directory "${skillRoot}" contains sensitive file "${relativePath}", which cannot be packaged. Remove credentials and private keys from the skill directory.`,
				);
			}
			if (isExcludedFile(entry.name)) {
				console.warn(
					`[bapX] Excluding skill file "${relativePath}" from the deployed application package because it is generated content.`,
				);
				continue;
			}
			files.push(absolutePath);
		}
	}
	return files.sort();
}

function isSensitiveFile(filename: string): boolean {
	const lowerFilename = filename.toLowerCase();
	return (
		EXCLUDED_FILES.has(lowerFilename) ||
		lowerFilename === '.dev.vars' ||
		lowerFilename.startsWith('.dev.vars.') ||
		lowerFilename === '.env' ||
		lowerFilename.startsWith('.env.') ||
		SENSITIVE_FILE_PATTERNS.some((pattern) => pattern.test(filename))
	);
}

function isExcludedFile(filename: string): boolean {
	const lowerFilename = filename.toLowerCase();
	return (
		lowerFilename === '.ds_store' ||
		lowerFilename.endsWith('.swp') ||
		lowerFilename.endsWith('.swo') ||
		lowerFilename.endsWith('~')
	);
}

function decodeSkillModuleId(
	source: string,
	internalPrefix: string,
	encodedInternalPrefix: string,
): string | undefined {
	if (source.startsWith(internalPrefix)) return source;
	const encodedIndex = source.indexOf(encodedInternalPrefix);
	if (encodedIndex !== -1)
		return `${internalPrefix}${source.slice(encodedIndex + encodedInternalPrefix.length)}`;
	return undefined;
}

function stripQueryAndHash(specifier: string): string {
	return specifier.split(/[?#]/, 1)[0] ?? specifier;
}

function isSkillMarkdownPath(specifier: string): boolean {
	return path.basename(stripQueryAndHash(specifier)) === 'SKILL.md';
}

interface ModuleAst {
	body: unknown[];
}

interface AstNode {
	type?: string;
	source?: { value?: unknown; start?: number; end?: number };
	attributes?: Array<{ key?: { name?: unknown; value?: unknown }; value?: { value?: unknown } }>;
}

interface AttributedImport {
	specifier: string;
	start: number;
	end: number;
}

function collectAttributedImports(
	ast: ModuleAst,
	attributeValue: 'markdown' | 'skill',
): AttributedImport[] {
	const imports: AttributedImport[] = [];
	for (const entry of ast.body) {
		const declaration = entry as AstNode;
		if (
			declaration.type !== 'ImportDeclaration' &&
			declaration.type !== 'ExportNamedDeclaration' &&
			declaration.type !== 'ExportAllDeclaration'
		)
			continue;
		const specifier = declaration.source?.value;
		if (typeof specifier !== 'string') continue;
		const matchesAttribute = declaration.attributes?.some((attribute) => {
			const key = attribute.key?.name ?? attribute.key?.value;
			return key === 'type' && attribute.value?.value === attributeValue;
		});
		if (!matchesAttribute) continue;
		const start = declaration.source?.start;
		const end = declaration.source?.end;
		if (typeof start !== 'number' || typeof end !== 'number') {
			throw new Error(`[bapX] Unable to transform ${attributeValue} import: ${specifier}`);
		}
		imports.push({ specifier, start, end });
	}
	return imports;
}

function assertNoDynamicSkillImports(ast: ModuleAst): void {
	visitAst(ast, (node) => {
		if (node.type !== 'ImportExpression') return;
		const specifier = node.source?.value;
		if (typeof specifier === 'string' && isSkillMarkdownPath(specifier)) {
			throw new Error(
				`[bapX] Dynamic SKILL.md import "${specifier}" is unsupported. Use a static import with { type: 'skill' }.`,
			);
		}
	});
}

function visitAst(value: unknown, visit: (node: AstNode) => void): void {
	if (!value || typeof value !== 'object') return;
	if (Array.isArray(value)) {
		for (const item of value) visitAst(item, visit);
		return;
	}
	const node = value as AstNode & Record<string, unknown>;
	if (typeof node.type === 'string') visit(node);
	for (const [key, child] of Object.entries(node)) {
		if (key !== 'start' && key !== 'end' && key !== 'loc') visitAst(child, visit);
	}
}
