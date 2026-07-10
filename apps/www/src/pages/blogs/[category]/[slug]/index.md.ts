import path from 'node:path';
import type { APIRoute } from 'astro';
import { loadMarkdownSources } from '../../../../lib/markdown-source';

export function getStaticPaths() {
	const root = path.resolve('src/content/blogs');
	return loadMarkdownSources(root).map(({ id, source }) => {
		const [category, slug] = id.split('/');
		return { params: { category, slug }, props: { source } };
	});
}

export const GET: APIRoute = ({ props }) =>
	new Response(props.source, {
		headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
	});
