import { defineConfig } from '@bapX/cli/config';

/**
 * Build-time config. `target` is intentionally unset so this example
 * runs against either `--target node` or `--target cloudflare` without
 * editing the file. Provider/model registration and Sentry init both
 * live in `src/app.ts` — those are runtime concerns.
 */
export default defineConfig({});
