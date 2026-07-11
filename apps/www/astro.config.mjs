// @ts-check

import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	site: 'https://bapx.in',
	output: 'static',
	trailingSlash: 'always',
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
