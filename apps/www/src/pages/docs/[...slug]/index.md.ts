import path from 'node:path';
import type { APIRoute } from 'astro';
import { loadMarkdownSources } from '../../../lib/markdown-source';

export function getStaticPaths() {
	const root = path.resolve('src/content/docs');
	const internalPrefixes = ['cli/', 'guide/', 'api/', 'sdk/', 'ecosystem/', 'reference/'];
	return loadMarkdownSources(root).filter(({ id }) => !internalPrefixes.some((prefix) => id.startsWith(prefix))).map(({ id, source }) => ({
		params: { slug: id },
		props: { source },
	}));
}

export const GET: APIRoute = ({ props }) =>
	new Response(props.source, {
		headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
	});
