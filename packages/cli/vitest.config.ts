import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['test/**/*.test.{ts,tsx}'],
		// `*.integration.test.ts` files run only via their dedicated configs
		// (e.g. `npm run test:integration:cloudflare`), which control
		// parallelism for workerd-backed fixtures.
		exclude: ['test/**/*.integration.test.ts'],
	},
});
