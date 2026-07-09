export default {
	resolve: {
		alias: {
			'@bapX/sdk': new URL('../sdk/src/index.ts', import.meta.url).pathname,
		},
	},
	test: {
		environment: 'happy-dom',
	},
};
