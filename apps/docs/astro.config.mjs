import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

export default defineConfig({
	site: 'https://docs.bapx.in',
	base: '/',
	trailingSlash: 'always',
	outDir: './dist',
	output: 'static',
	integrations: [mdx()],
	markdown: {
		shikiConfig: {
			theme: 'github-dark',
		},
	},
	vite: {
		plugins: tailwindcss(),
	},
});
