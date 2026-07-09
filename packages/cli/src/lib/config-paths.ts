import * as path from 'node:path';

/**
 * Config file basenames searched, in priority order. TypeScript first because
 * Bapx's audience writes TS agents; the rest mirror Vite's supported set.
 */
export const CONFIG_BASENAMES = Object.freeze([
	'bapX.config.ts',
	'bapX.config.mts',
	'bapX.config.mjs',
	'bapX.config.js',
	'bapX.config.cjs',
	'bapX.config.cts',
]);

export function resolveConfigCandidates(opts: {
	cwd: string;
	searchFrom: string;
	configFile: string | undefined;
}): string[] {
	if (opts.configFile !== undefined) return [path.resolve(opts.cwd, opts.configFile)];
	return CONFIG_BASENAMES.map((basename) => path.join(opts.searchFrom, basename));
}
