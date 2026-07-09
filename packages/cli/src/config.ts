/**
 * Public `@bapX/cli/config` subpath. Exposes only what `bapX.config.ts`
 * authors need; config discovery and resolution are internal to the CLI.
 */

export { defineConfig, type FlueConfig, type UserFlueConfig } from './lib/config.ts';
