import { defineConfig } from 'tsdown';

export default defineConfig({
	entry: { 'bapX-dev-console': 'bin/bapX-dev-console.ts' },
	format: ['esm'],
	dts: false,
	clean: true,
	outDir: 'dist',
});
