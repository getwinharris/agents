/**
 * Public `@bapX/cli/config` subpath. Exposes only what `bapX.config.ts`
 * authors need; config discovery and resolution are internal to the CLI.
 */

export { defineConfig, type BapxConfig, type UserBapxConfig } from './lib/config.ts';
