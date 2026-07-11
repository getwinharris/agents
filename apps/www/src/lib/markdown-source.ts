import fs from 'node:fs';
import path from 'node:path';

const MARKDOWN_EXTENSIONS = new Set([
	'.md',
	'.mdx',
	'.markdown',
	'.mdown',
	'.mkdn',
	'.mkd',
	'.mdwn',
]);

export function loadMarkdownSources(root: string) {
	const sources: Array<{ id: string; source: string }> = [];

	function visit(directory: string) {
		for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
			if (entry.name.startsWith('_')) continue;
			const absolutePath = path.join(directory, entry.name);
			if (entry.isDirectory()) {
				visit(absolutePath);
				continue;
			}
			const extension = path.extname(entry.name);
			if (!MARKDOWN_EXTENSIONS.has(extension)) continue;
			sources.push({
				id: path
					.relative(root, absolutePath)
					.slice(0, -extension.length)
					.split(path.sep)
					.join('/')
					.toLowerCase(),
				source: fs.readFileSync(absolutePath, 'utf8'),
			});
		}
	}

	visit(root);
	return sources;
}
