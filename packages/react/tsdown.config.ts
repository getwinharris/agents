import { defineConfig } from 'tsdown';

export default defineConfig({
	entry: ['src/index.ts'],
	format: ['esm'],
	dts: true,
	clean: true,
	deps: { neverBundle: ['@bapX/sdk', 'react', 'react/jsx-runtime'] },
});
