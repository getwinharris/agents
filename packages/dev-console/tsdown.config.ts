import { defineConfig } from 'tsdown';

export default defineConfig({
	entry: { 'flue-dev-console': 'bin/flue-dev-console.ts' },
	format: ['esm'],
	dts: false,
	clean: true,
	outDir: 'dist',
});
