#!/usr/bin/env node
// Bring tracked Markdown into OKF shape and generate folder indexes.
//
// OKF §4.1 requires `type` in the frontmatter of every concept document; §6
// defines `index.yaml` as the folder-level machine-readable entry point that
// lets an agent read one file before opening the folder's documents.
//
// `bapX okf index` reports what exists but writes nothing, so nothing kept the
// tree in OKF shape. This is the writer.
//
// Usage:
//   node scripts/okf-normalize.mjs           # report only, exit 1 if work remains
//   node scripts/okf-normalize.mjs --write   # add frontmatter and write index.yaml

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const write = process.argv.includes('--write');

// Directories that are not repository knowledge: vendored code, build output,
// and example projects that ship as templates rather than as documentation.
const SKIP = /^(node_modules|dist|\.git|examples|resource-git-for-extract)(\/|$)/;

function trackedMarkdown() {
	return execFileSync('git', ['ls-files', '*.md'], { cwd: repoRoot, encoding: 'utf8' })
		.split('\n')
		.filter((file) => file && !SKIP.test(file));
}

function hasFrontmatter(text) {
	return text.startsWith('---\n') || text.startsWith('---\r\n');
}

// YAML scalars: quote anything that could be misread, and escape what we quote.
function scalar(value) {
	const clean = String(value ?? '').replace(/\s+/g, ' ').trim();
	return `"${clean.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

// The document's own H1 is the most reliable title; fall back to the filename.
function deriveTitle(text, file) {
	const heading = /^#\s+(.+?)\s*$/m.exec(text);
	if (heading) return heading[1].replace(/[`*_]/g, '').trim();
	const base = path.basename(file, '.md');
	if (base === 'README') return `${path.basename(path.dirname(file)) || 'Repository'} README`;
	return base.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// First real prose line after the H1 — not a badge, link-only line, or heading.
function deriveDescription(text) {
	const lines = text.split('\n');
	let seenHeading = false;
	for (const raw of lines) {
		const line = raw.trim();
		if (!line) continue;
		if (line.startsWith('#')) { seenHeading = true; continue; }
		if (!seenHeading) continue;
		if (/^[[!<|>-]/.test(line) || line.startsWith('```')) continue;
		const clean = line.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[`*_]/g, '').trim();
		if (clean.length < 12) continue;
		return clean.length > 180 ? `${clean.slice(0, 177)}…` : clean;
	}
	return '';
}

// OKF `type` is producer-defined (§4.1). Derive it from location so the value
// carries meaning for a query rather than being a constant.
function deriveType(file) {
	const p = file.toLowerCase();
	if (p.startsWith('blueprints/')) return 'Blueprint';
	if (p.startsWith('internal-docs/')) return 'Internal Doc';
	if (p.startsWith('plans/')) return 'Plan';
	if (p.includes('/content/docs/')) return 'Public Doc';
	if (p.startsWith('packages/') || p.startsWith('apps/')) return 'Package Doc';
	if (p.startsWith('.github/') || p.startsWith('.agents/')) return 'Repository Process';
	// Root-level contract and planning files govern how the repository is worked,
	// so they are not generic documents.
	if (!file.includes('/')) {
		if (/^(agents|claude|contributing)\.md$/.test(p)) return 'Contract';
		if (/^(objective|todo)\.md$/.test(p)) return 'Plan';
		if (p === 'changelog.md') return 'Changelog';
	}
	if (path.basename(file) === 'README.md') return 'Readme';
	return 'Document';
}

const files = trackedMarkdown();
const missing = [];

for (const file of files) {
	const absolute = path.join(repoRoot, file);
	const text = fs.readFileSync(absolute, 'utf8');
	if (hasFrontmatter(text)) continue;
	missing.push(file);
	if (!write) continue;

	const title = deriveTitle(text, file);
	const description = deriveDescription(text);
	const block = [
		'---',
		`type: ${scalar(deriveType(file))}`,
		`title: ${scalar(title)}`,
		...(description ? [`description: ${scalar(description)}`] : []),
		'---',
		'',
	].join('\n');
	fs.writeFileSync(absolute, block + text);
}

// ─── Folder indexes ─────────────────────────────────────────────────────────

function frontmatterOf(absolute) {
	const text = fs.readFileSync(absolute, 'utf8');
	if (!hasFrontmatter(text)) return {};
	const end = text.indexOf('\n---', 4);
	if (end === -1) return {};
	const fields = {};
	for (const line of text.slice(4, end).split('\n')) {
		const match = /^(\w+):\s*(.*)$/.exec(line);
		if (match) fields[match[1]] = match[2].replace(/^"(.*)"$/, '$1').replace(/\\"/g, '"');
	}
	return fields;
}

const byFolder = new Map();
for (const file of trackedMarkdown()) {
	const folder = path.dirname(file);
	if (!byFolder.has(folder)) byFolder.set(folder, []);
	byFolder.get(folder).push(file);
}

const indexes = [];
for (const [folder, entries] of [...byFolder].sort()) {
	const absolute = path.join(repoRoot, folder, 'index.yaml');
	const children = entries.sort().map((file) => {
		const fields = frontmatterOf(path.join(repoRoot, file));
		return { path: path.basename(file), title: fields.title || path.basename(file), description: fields.description || '' };
	});
	// Subdirectories that themselves carry documents, so a reader can descend.
	const subdirectories = [...byFolder.keys()]
		.filter((other) => other !== folder && path.dirname(other) === folder)
		.sort()
		.map((other) => ({ path: `${path.basename(other)}/`, title: path.basename(other), description: '' }));

	const name = folder === '.' ? 'Repository root' : folder;
	const lines = [
		`title: ${scalar(name)}`,
		`description: ${scalar(`OKF folder index for ${name}.`)}`,
		'type: folder-index',
		'children:',
		...[...children, ...subdirectories].flatMap((child) => [
			`  - path: ${scalar(child.path)}`,
			`    title: ${scalar(child.title)}`,
			...(child.description ? [`    description: ${scalar(child.description)}`] : []),
		]),
		'',
	];
	indexes.push(folder);
	if (write) fs.writeFileSync(absolute, lines.join('\n'));
}

if (write) {
	console.log(`okf: added frontmatter to ${missing.length} file(s), wrote ${indexes.length} index.yaml`);
} else {
	console.log(`okf: ${files.length} tracked markdown file(s); ${missing.length} without frontmatter; ${indexes.length} folder(s) need index.yaml`);
	if (missing.length) {
		for (const file of missing.slice(0, 20)) console.log(`  missing frontmatter: ${file}`);
		if (missing.length > 20) console.log(`  … and ${missing.length - 20} more`);
	}
}

const unindexed = indexes.filter((folder) => !fs.existsSync(path.join(repoRoot, folder, 'index.yaml')));
if (!write && (missing.length || unindexed.length)) process.exit(1);
