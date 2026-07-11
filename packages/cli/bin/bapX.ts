#!/usr/bin/env node
import { type ChildProcess, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type ParseArgsOptionsConfig, parseArgs as parseNodeArgs } from 'node:util';
import type { ConversationStreamChunk, BapxEvent } from '@bapX/sdk';
import { determineAgent } from '@vercel/detect-agent';
import MiniSearch from 'minisearch';
import pc from 'picocolors';
import { build } from '../src/lib/build.ts';
import {
	type BapxConfig,
	resolveConfig,
	resolveConfigPath,
	type UserBapxConfig,
} from '../src/lib/config.ts';
import { resolveConfigCandidates } from '../src/lib/config-paths.ts';
import { closeExecutionForSignal } from '../src/lib/console-shutdown.ts';
import { DEFAULT_DEV_PORT, dev } from '../src/lib/dev.ts';
import { createEnvLoader, type EnvLoader, selectEnvFile } from '../src/lib/env.ts';
import {
	createExecutionLifecycle,
	type ExecutionLifecycle,
} from '../src/lib/execution-lifecycle.ts';
import { createLineEventPresenter } from '../src/lib/line-event-presenter.ts';
import { parseAgentInput, runTarget } from '../src/lib/run-controller.ts';
import { parseHeaders, resolveServerUrl } from '../src/lib/run-http.ts';
import { brand, brandRows, error as cliError, note, row, success } from '../src/lib/terminal.ts';
import { BLUEPRINTS, KIND_ROOTS } from './_blueprints.generated.ts';

interface ApplicationConfigArgs {
	target?: 'node' | 'cloudflare';
	explicitRoot: string | undefined;
	explicitOutput: string | undefined;
	configFile: string | undefined;
	envFile: string | undefined;
}

function loadCliEnvironment(args: ApplicationConfigArgs): EnvLoader {
	try {
		const cwd = process.cwd();
		const searchFrom = args.explicitRoot ?? cwd;
		const configPath =
			args.configFile !== undefined
				? resolveConfigPath({ cwd, configFile: args.configFile })
				: resolveConfigPath({ cwd: searchFrom, configFile: undefined });
		const baseDir = configPath ? path.dirname(configPath) : searchFrom;
		const envLoader = createEnvLoader(selectEnvFile(args.envFile, baseDir));
		envLoader.apply();
		return envLoader;
	} catch (err) {
		cliError(err instanceof Error ? err.message : String(err));
		process.exit(1);
	}
}

/** Resolve CLI flags, config file values, and defaults into one config. */
async function resolveCliConfig(args: {
	target?: 'node' | 'cloudflare';
	explicitRoot: string | undefined;
	explicitOutput: string | undefined;
	configFile: string | undefined;
}): Promise<{ cfg: BapxConfig; configPath?: string; viteConfig: import('vite').UserConfig }> {
	const inline: UserBapxConfig = {};
	if (args.target) inline.target = args.target;
	if (args.explicitRoot) inline.root = args.explicitRoot;
	if (args.explicitOutput) inline.output = args.explicitOutput;

	try {
		const { bapXConfig, configPath, viteConfig } = await resolveConfig({
			cwd: process.cwd(),
			searchFrom: args.explicitRoot ?? process.cwd(),
			configFile: args.configFile,
			inline,
		});
		return { cfg: bapXConfig, configPath, viteConfig };
	} catch (err) {
		cliError(err instanceof Error ? err.message : String(err));
		process.exit(1);
	}
}

async function resolveApplicationCommand(args: ApplicationConfigArgs): Promise<{
	cfg: BapxConfig;
	envLoader: EnvLoader;
	configPath?: string;
	viteConfig: import('vite').UserConfig;
}> {
	const envLoader = loadCliEnvironment(args);
	const { cfg, configPath, viteConfig } = await resolveCliConfig(args);
	return { cfg, envLoader, configPath, viteConfig };
}

// ─── Arg Parsing ────────────────────────────────────────────────────────────

function printUsage(log: (message: string) => void = console.error) {
	log(
		'Usage:\n' +
			'  bapX dev   [--target <node|cloudflare>] [--root <path>] [--output <path>] [--config <path>] [--port <number>] [--env <path>]\n' +
			"  bapX run     <name> [--target <node|cloudflare>] [--id <id>] [--input <json>] [--server <path|url>] [--header 'Name: value'] [--root <path>] [--output <path>] [--config <path>] [--env <path>]\n" +
			'  bapX build   [--target <node|cloudflare>] [--root <path>] [--output <path>] [--config <path>] [--env <path>]\n' +
			'  bapX init  --target <node|cloudflare> [--root <path>] [--force]\n' +
			'  bapX add   [<kind> <name|url>] [--print]\n' +
			'  bapX update <kind> <name|url> [--print]\n' +
			'  bapX docs  [read <path> | search <query>]\n' +
			'  bapX map   [--root <path>] [--check] [--profile <user-workspace|business-workspace|user-project|demo-project>]\n' +
			'\n' +
			'Commands:\n' +
			'  dev    Long-running watch-mode dev server. Rebuilds and reloads on file changes.\n' +
			'  run      Invoke one agent or workflow through its normal HTTP application, then exit.\n' +
			'  build    Build a deployable artifact to ./dist (production deploys).\n' +
			'  init   Scaffold a starter bapX.config.ts in the target directory.\n' +
			'  add    Fetch a blueprint implementation guide for an AI coding agent to follow.\n' +
			'  update Fetch an updated blueprint implementation guide for an AI coding agent to follow.\n' +
			'  docs   Browse the Bapx docs. No args lists pages; `read` prints a page as markdown; `search` prints JSON results.\n' +
			'  map    Generate or validate the project root map.mmd from the real directory layout.\n' +
			'\n' +
			'Flags:\n' +
			'  --root <path>        Project root. Default: current working directory.\n' +
			'  --output <path>      Where the build artifacts are written. Default: <root>/dist.\n' +
			'  --config <path>      Path to a bapX.config.{ts,mts,mjs,js,cjs,cts} file (relative to cwd).\n' +
			'                       Default: search the root dir (or cwd) for `bapX.config.*`.\n' +
			'                       CLI flags always override values set in the config file.\n' +
			`  --port <number>      Port for the dev server. Default: ${DEFAULT_DEV_PORT}\n` +
			'  --env <path>         Select one alternate .env-format file for build/dev/run before config loads.\n' +
			'                       Without --env, these commands load <project>/.env when present. Shell values win.\n' +
			'  --print              (bapX add/update) Print the raw blueprint Markdown to stdout regardless of whether the caller is an agent.\n' +
			'  --force              (bapX init) Overwrite an existing bapX.config.* in the target directory.\n' +
			'  --check              (bapX map) Validate map.mmd without writing it.\n' +
			'  --profile <name>     (bapX map) Also validate required bapX workspace/project files.\n' +
			'\n' +
			'Examples:\n' +
			'  bapX dev --target node\n' +
			'  bapX dev --target cloudflare --port 8787\n' +
			'  bapX run hello --target node\n' +
			'  bapX run hello --target node --input \'{"name": "World"}\' --env .env.staging\n' +
			'  bapX build --target node\n' +
			'  bapX build --target cloudflare --root ./my-app\n' +
			'  bapX build --target node --output ./build\n' +
			'  bapX init --target node\n' +
			'  bapX add\n' +
			'  bapX add sandbox daytona | claude\n' +
			'  bapX add channel slack | codex\n' +
			'  bapX add sandbox https://e2b.dev | claude\n' +
			'  bapX add channel https://developers.notion.com/reference/webhooks | codex\n' +
			'  bapX update channel slack | claude\n' +
			'  bapX docs\n' +
			'  bapX docs read guide/sandboxes\n' +
			'  bapX docs search "durable execution"\n' +
			'  bapX map --root ./my-app\n' +
			'  bapX map --root ./my-business --check --profile business-workspace\n' +
			'  bapX map --root ./my-business/projects/my-app --check --profile user-project\n' +
			'\n' +
			'Note: set the model in `defineAgent(() => ({ model: "provider-id/model-id" }))` ' +
			'or per-call `{ model: ... }` on prompt/skill/task.',
	);
}

interface RunArgs {
	command: 'run';
	resource: string;
	target: 'node' | 'cloudflare' | undefined;
	input: string | undefined;
	id: string | undefined;
	server: string | undefined;
	headers: string[];
	explicitRoot: string | undefined;
	explicitOutput: string | undefined;
	configFile: string | undefined;
	envFile: string | undefined;
}

interface BuildArgs {
	command: 'build';
	/** May be undefined if the user is relying on `bapX.config.ts` for `target`. */
	target: 'node' | 'cloudflare' | undefined;
	/** Explicit --root value, or undefined to default to cwd. */
	explicitRoot: string | undefined;
	/** Explicit --output value, or undefined to default to <root>/dist. */
	explicitOutput: string | undefined;
	/** Explicit --config value, or undefined to auto-discover. */
	configFile: string | undefined;
	envFile: string | undefined;
}

interface DevArgs {
	command: 'dev';
	/** May be undefined if the user is relying on `bapX.config.ts` for `target`. */
	target: 'node' | 'cloudflare' | undefined;
	/** Explicit --root value, or undefined to default to cwd. */
	explicitRoot: string | undefined;
	/** Explicit --output value, or undefined to default to <root>/dist. */
	explicitOutput: string | undefined;
	/** Explicit --config value, or undefined to auto-discover. */
	configFile: string | undefined;
	/** 0 = use the library default (DEFAULT_DEV_PORT). */
	port: number;
	/** Explicit --env file, or undefined to use the default project .env. */
	envFile: string | undefined;
}

interface BlueprintCommandOptions {
	kind: string;
	target: string;
	print: boolean;
}

interface AddArgs extends BlueprintCommandOptions {
	command: 'add';
}

interface UpdateArgs extends BlueprintCommandOptions {
	command: 'update';
}

type BlueprintCommandArgs = AddArgs | UpdateArgs;

interface DocsArgs {
	command: 'docs';
	action: 'list' | 'read' | 'search';
	/** Page path for `read`, query for `search`, empty for `list`. */
	value: string;
}

interface InitArgs {
	command: 'init';
	target: 'node' | 'cloudflare';
	/** Explicit --root value, or undefined to default to cwd. Absolute when set. */
	explicitRoot: string | undefined;
	force: boolean;
}

interface MapArgs {
	command: 'map';
	/** Explicit --root value, or undefined to default to cwd. Absolute when set. */
	explicitRoot: string | undefined;
	check: boolean;
	profile:
		| 'user-workspace'
		| 'business-workspace'
		| 'user-project'
		| 'demo-project'
		| undefined;
}

type ParsedArgs = RunArgs | BuildArgs | DevArgs | BlueprintCommandArgs | DocsArgs | InitArgs | MapArgs;

type ParsedOptionToken = Extract<
	NonNullable<ReturnType<typeof parseNodeArgs>['tokens']>[number],
	{ kind: 'option' }
>;
type CliValue = string | boolean | Array<string | boolean> | undefined;
type CliValues = Record<string, CliValue>;

const SHARED_PARSE_OPTIONS = {
	input: { type: 'string' },
	id: { type: 'string' },
	server: { type: 'string' },
	header: { type: 'string', multiple: true },
	target: { type: 'string' },
	root: { type: 'string' },
	output: { type: 'string' },
	config: { type: 'string' },
	port: { type: 'string' },
	env: { type: 'string', multiple: true },
	check: { type: 'boolean' },
	profile: { type: 'string' },
} as const;

/** Every flag `parseFlags` knows how to parse, across all commands that use it. */
const SHARED_FLAGS = new Set(Object.keys(SHARED_PARSE_OPTIONS).map((name) => `--${name}`));

function fail(message: string, usage = false): never {
	console.error(message);
	if (usage) printUsage();
	process.exit(1);
}

function parseCommandOptions(
	command: string,
	args: string[],
	options: ParseArgsOptionsConfig,
	allowed: ReadonlySet<string>,
	known: ReadonlySet<string> = allowed,
) {
	const parsed = parseNodeArgs({
		args,
		options,
		allowPositionals: true,
		strict: false,
		tokens: true,
	});
	for (const token of (parsed.tokens ?? []).filter(
		(token): token is ParsedOptionToken => token.kind === 'option',
	)) {
		const optionName = token.name;
		if (!known.has(token.rawName)) {
			fail(`Unknown flag for \`bapX ${command}\`: ${token.rawName}`, true);
		}
		if (!allowed.has(token.rawName)) {
			fail(`\`bapX ${command}\` does not accept ${token.rawName}.`);
		}
		// Prevent a following known flag from being consumed as this string option's value.
		if (
			options[optionName]?.type === 'string' &&
			token.inlineValue === false &&
			token.value !== undefined
		) {
			const separator = token.value.indexOf('=');
			const valueName = separator === -1 ? token.value : token.value.slice(0, separator);
			if (known.has(valueName)) fail(`Missing value for ${token.rawName}`);
		}
		if (options[optionName]?.type === 'boolean' && token.value !== undefined) {
			fail(`${token.rawName} does not accept a value`);
		}
	}
	return { positionals: parsed.positionals, values: parsed.values as CliValues };
}

function stringFlag(values: CliValues, name: string, missingMessage: string): string | undefined {
	const value = values[name];
	if (value === undefined) return undefined;
	if (typeof value !== 'string' || value.length === 0) fail(missingMessage);
	return value;
}

function stringListFlag(values: CliValues, name: string, missingMessage: string): string[] {
	const value = values[name];
	const valuesList = value === undefined ? [] : Array.isArray(value) ? value : [value];
	const strings: string[] = [];
	for (const item of valuesList) {
		if (typeof item !== 'string' || item.length === 0) fail(missingMessage);
		strings.push(item);
	}
	return strings;
}

function booleanFlag(values: CliValues, name: string, flag: string): boolean {
	const value = values[name];
	if (value === undefined) return false;
	if (value !== true) fail(`${flag} does not accept a value`);
	return true;
}

function targetFlag(value: string | undefined): 'node' | 'cloudflare' | undefined {
	if (value !== undefined && value !== 'node' && value !== 'cloudflare') {
		fail(`Invalid target: "${value}". Supported targets: node, cloudflare`);
	}
	return value;
}

function parseFlags(
	command: 'build' | 'dev' | 'run',
	args: string[],
	allowed: ReadonlySet<string>,
): {
	positionals: string[];
	target?: 'node' | 'cloudflare';
	explicitRoot: string | undefined;
	explicitOutput: string | undefined;
	configFile: string | undefined;
	input: string | undefined;
	id: string | undefined;
	server: string | undefined;
	headers: string[];
	port: number;
	envFile: string | undefined;
} {
	const { positionals, values } = parseCommandOptions(
		command,
		args,
		SHARED_PARSE_OPTIONS,
		allowed,
		SHARED_FLAGS,
	);
	const envFiles = stringListFlag(values, 'env', 'Missing value for --env');
	if (envFiles.length > 1) {
		fail('`--env` accepts one file. Combine values into one file or provide shell overrides.');
	}

	const portStr = stringFlag(values, 'port', 'Invalid value for --port');
	let port = 0;
	if (portStr !== undefined) {
		port = parseInt(portStr, 10);
		if (Number.isNaN(port)) fail('Invalid value for --port');
	}

	return {
		positionals,
		target: targetFlag(stringFlag(values, 'target', 'Missing value for --target')),
		explicitRoot: pathFlag(values, 'root', 'Missing value for --root'),
		explicitOutput: pathFlag(values, 'output', 'Missing value for --output'),
		// `--config` is intentionally NOT pre-resolved: the config loader
		// resolves it vs. cwd at load time, mirroring how Vite handles `--config`.
		configFile: stringFlag(values, 'config', 'Missing value for --config'),
		input: stringFlag(values, 'input', 'Missing value for --input'),
		id: stringFlag(values, 'id', 'Missing value for --id'),
		server: stringFlag(values, 'server', 'Missing value for --server'),
		headers: stringListFlag(values, 'header', 'Missing value for --header'),
		port,
		envFile: envFiles[0],
	};
}

function pathFlag(values: CliValues, name: string, missingMessage: string): string | undefined {
	const value = stringFlag(values, name, missingMessage);
	return value ? path.resolve(value) : undefined;
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

function parseBlueprintCommandArgs(
	command: 'add' | 'update',
	rest: string[],
): BlueprintCommandArgs {
	const { positionals, values } = parseCommandOptions(
		command,
		rest,
		{ print: { type: 'boolean' } },
		new Set(['--print']),
	);
	const print = booleanFlag(values, 'print', '--print');

	if (command === 'add' && positionals.length === 0) {
		return { command, kind: '', target: '', print };
	}

	if (positionals.length < 2) {
		console.error(
			`Missing blueprint ${positionals.length === 0 ? 'kind and name or URL' : 'name or URL'}.\n\nUsage:\n  bapX ${command} <kind> <name|url> [--print]`,
		);
		process.exit(1);
	}

	const extra = positionals[2];
	if (extra !== undefined) {
		console.error(`Unexpected extra argument for \`bapX ${command}\`: ${extra}`);
		printUsage();
		process.exit(1);
	}

	return {
		command,
		kind: positionals[0] ?? '',
		target: positionals[1] ?? '',
		print,
	};
}

function parseDocsArgs(rest: string[]): DocsArgs {
	const [action, ...values] = rest;

	if (action === undefined) {
		return { command: 'docs', action: 'list', value: '' };
	}

	if (action === 'read') {
		const value = values[0];
		if (!value) {
			console.error('Missing docs page path.\n\nUsage:\n  bapX docs read <path>');
			process.exit(1);
		}
		const extra = values[1];
		if (extra !== undefined) {
			console.error(`Unexpected extra argument for \`bapX docs read\`: ${extra}`);
			process.exit(1);
		}
		return { command: 'docs', action: 'read', value };
	}

	if (action === 'search') {
		const value = values.join(' ').trim();
		if (!value) {
			console.error('Missing search query.\n\nUsage:\n  bapX docs search <query>');
			process.exit(1);
		}
		return { command: 'docs', action: 'search', value };
	}

	console.error(
		`Unknown \`bapX docs\` subcommand: ${action}\n\n` +
			'Usage:\n' +
			'  bapX docs                  List all documentation pages\n' +
			'  bapX docs read <path>      Print a documentation page as markdown\n' +
			'  bapX docs search <query>   Search the documentation (JSON results)\n' +
			(action.includes('/') ? `\nDid you mean \`bapX docs read ${action}\`?\n` : ''),
	);
	process.exit(1);
}

function parseInitArgs(rest: string[]): InitArgs {
	const { positionals, values } = parseCommandOptions(
		'init',
		rest,
		{
			target: { type: 'string' },
			root: { type: 'string' },
			force: { type: 'boolean' },
		},
		new Set(['--target', '--root', '--force']),
	);
	const target = targetFlag(stringFlag(values, 'target', 'Missing value for --target'));

	for (const positional of positionals) {
		fail(`Unexpected argument for \`bapX init\`: ${positional}`, true);
	}

	if (!target) {
		fail('Missing required --target flag for init command.', true);
	}

	return {
		command: 'init',
		target,
		explicitRoot: pathFlag(values, 'root', 'Missing value for --root'),
		force: booleanFlag(values, 'force', '--force'),
	};
}

function parseMapArgs(rest: string[]): MapArgs {
	const { positionals, values } = parseCommandOptions(
		'map',
		rest,
		{
			root: { type: 'string' },
			check: { type: 'boolean' },
			profile: { type: 'string' },
		},
		new Set(['--root', '--check', '--profile']),
	);

	for (const positional of positionals) {
		fail(`Unexpected argument for \`bapX map\`: ${positional}`, true);
	}

	const profile = stringFlag(values, 'profile', 'Missing value for --profile');
	if (
		profile !== undefined &&
		profile !== 'user-workspace' &&
		profile !== 'business-workspace' &&
		profile !== 'user-project' &&
		profile !== 'demo-project'
	) {
		fail(
			`Invalid profile: "${profile}". Supported profiles: user-workspace, business-workspace, user-project, demo-project`,
			true,
		);
	}

	return {
		command: 'map',
		explicitRoot: pathFlag(values, 'root', 'Missing value for --root'),
		check: booleanFlag(values, 'check', '--check'),
		profile,
	};
}

function parseArgs(argv: string[]): ParsedArgs {
	const [command, ...rest] = argv;

	if (command === '--help' || command === '-h' || command === 'help') {
		printUsage(console.log);
		process.exit(0);
	}

	if (command === '--version' || command === '-v') {
		console.log(readCliVersion());
		process.exit(0);
	}

	if (command === 'add' || command === 'update') {
		return parseBlueprintCommandArgs(command, rest);
	}

	if (command === 'docs') {
		return parseDocsArgs(rest);
	}

	if (command === 'init') {
		return parseInitArgs(rest);
	}

	if (command === 'map') {
		return parseMapArgs(rest);
	}

	// `--target` is optional at parse time — the config file may supply it.
	// `resolveCliConfig` enforces it being set somewhere by the time we need it.

	if (command === 'build') {
		const flags = parseFlags(
			'build',
			rest,
			new Set(['--target', '--root', '--output', '--config', '--env']),
		);
		if (flags.positionals.length > 0) {
			console.error(`Unexpected argument for \`bapX build\`: ${flags.positionals[0]}`);
			printUsage();
			process.exit(1);
		}
		return {
			command: 'build',
			target: flags.target,
			explicitRoot: flags.explicitRoot,
			explicitOutput: flags.explicitOutput,
			configFile: flags.configFile,
			envFile: flags.envFile,
		};
	}

	if (command === 'dev') {
		const flags = parseFlags(
			'dev',
			rest,
			new Set(['--target', '--root', '--output', '--config', '--port', '--env']),
		);
		if (flags.positionals.length > 0) {
			console.error(`Unexpected argument for \`bapX dev\`: ${flags.positionals[0]}`);
			printUsage();
			process.exit(1);
		}
		return {
			command: 'dev',
			target: flags.target,
			explicitRoot: flags.explicitRoot,
			explicitOutput: flags.explicitOutput,
			configFile: flags.configFile,
			port: flags.port,
			envFile: flags.envFile,
		};
	}

	if (command === 'run') {
		const flags = parseFlags(
			command,
			rest,
			new Set([
				'--target',
				'--input',
				'--id',
				'--server',
				'--header',
				'--root',
				'--output',
				'--config',
				'--env',
			]),
		);
		const [resource, ...extra] = flags.positionals;
		if (!resource) {
			console.error(`Missing agent or workflow name for ${command} command.`);
			printUsage();
			process.exit(1);
		}
		if (extra.length > 0) {
			console.error(`Unexpected extra arguments for \`bapX ${command}\`: ${extra.join(' ')}`);
			printUsage();
			process.exit(1);
		}
		if (flags.input !== undefined) {
			try {
				JSON.parse(flags.input);
			} catch {
				console.error(`Invalid JSON for --input: ${flags.input}`);
				process.exit(1);
			}
		}
		try {
			parseHeaders(flags.headers);
			if (flags.server !== undefined) resolveServerUrl(flags.server);
		} catch (error) {
			fail(error instanceof Error ? error.message : String(error));
		}

		return {
			command,
			resource,
			target: flags.target,
			input: flags.input,
			id: flags.id,
			server: flags.server,
			headers: flags.headers,
			explicitRoot: flags.explicitRoot,
			explicitOutput: flags.explicitOutput,
			configFile: flags.configFile,
			envFile: flags.envFile,
		};
	}

	printUsage();
	process.exit(1);
}

const MAP_TOP_LEVEL_ORDER = [
	'apps',
	'packages',
	'examples',
	'demo',
	'projects',
	'docs',
	'content',
	'src',
	'agents',
	'workflows',
	'assets',
	'public',
	'tests',
	'test',
	'blueprints',
	'skills',
	'scripts',
	'.bapX',
	'.agents',
	'.github',
] as const;

const MAP_CHILD_DIRECTORIES = new Set(['apps', 'packages', 'examples', 'projects', 'docs']);
const MAP_SKIPPED_DIRECTORIES = new Set([
	'.git',
	'.turbo',
	'node_modules',
	'dist',
	'build',
	'test-results',
]);

function mapNodeId(relPath: string): string {
	return `n_${relPath.replace(/[^A-Za-z0-9]/g, '_').replace(/^_+/, '')}`;
}

function mapNodeLabel(relPath: string): string {
	return relPath.replace(/"/g, '\\"');
}

function isDirectory(absPath: string): boolean {
	try {
		return fs.statSync(absPath).isDirectory();
	} catch {
		return false;
	}
}

function listMapChildDirs(root: string, relPath: string): string[] {
	return fs
		.readdirSync(path.join(root, relPath), { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && !MAP_SKIPPED_DIRECTORIES.has(entry.name))
		.map((entry) => entry.name)
		.sort((a, b) => a.localeCompare(b));
}

function generateDemoProjectMap(): string {
	return [
		'flowchart TD',
		'  root["demo"]',
		'  okf["OKF.md"]',
		'  docs["docs"]',
		'  docsIndex["docs/index.md"]',
		'  docsMap["docs/map.mmd"]',
		'  readme["README.md"]',
		'  packageJson["package.json"]',
		'  src["src"]',
		'  main["src/main.tsx"]',
		'  router["src/router.tsx"]',
		'  components["src/components"]',
		'  state["src/state"]',
		'  lib["src/lib"]',
		'  styles["src/styles"]',
		'  public["public"]',
		'',
		'  root --> okf',
		'  root --> docs',
		'  docs --> docsIndex',
		'  docs --> docsMap',
		'  root --> readme',
		'  root --> packageJson',
		'  root --> src',
		'  src --> main',
		'  src --> router',
		'  src --> components',
		'  src --> state',
		'  src --> lib',
		'  src --> styles',
		'  root --> public',
		'',
		'%% Generated by `bapX map --profile demo-project`. Do not edit by hand.',
		'',
	].join('\n');
}

function generateProjectMap(root: string, profile: MapArgs['profile']): string {
	if (profile === 'demo-project') return generateDemoProjectMap();

	const lines = ['flowchart TD', `  root["${mapNodeLabel(path.basename(root) || root)}"]`];

	for (const topLevel of MAP_TOP_LEVEL_ORDER) {
		if (!isDirectory(path.join(root, topLevel))) continue;

		const parentId = mapNodeId(topLevel);
		lines.push(`  ${parentId}["${mapNodeLabel(topLevel)}"]`);
		lines.push(`  root --> ${parentId}`);

		if (!MAP_CHILD_DIRECTORIES.has(topLevel)) continue;

		for (const child of listMapChildDirs(root, topLevel)) {
			const childPath = `${topLevel}/${child}`;
			const childId = mapNodeId(childPath);
			lines.push(`  ${childId}["${mapNodeLabel(childPath)}"]`);
			lines.push(`  ${parentId} --> ${childId}`);
		}
	}

	lines.push('');
	lines.push('%% Generated by `bapX map`. Do not edit by hand.');
	return `${lines.join('\n')}\n`;
}

function validatePathRequirement(
	root: string,
	relPath: string,
	kind: 'file' | 'dir',
): string | undefined {
	const absPath = path.join(root, relPath);
	if (kind === 'file') {
		return fs.existsSync(absPath) && fs.statSync(absPath).isFile() ? undefined : relPath;
	}
	return isDirectory(absPath) ? undefined : relPath;
}

function validateMapProfile(root: string, profile: MapArgs['profile']): string[] {
	if (profile === undefined) return [];

	const requirements: Array<[string, 'file' | 'dir']> =
		profile === 'user-workspace'
			? [
					['.git', 'dir'],
					['OKF.md', 'file'],
					['index.md', 'file'],
					['map.mmd', 'file'],
				]
			: profile === 'business-workspace'
				? [
						['index.md', 'file'],
						['map.mmd', 'file'],
						['DESIGN.md', 'file'],
						['brand.css', 'file'],
						['logos', 'dir'],
						['logos/index.md', 'file'],
						['logos/map.mmd', 'file'],
						['projects', 'dir'],
						['projects/index.md', 'file'],
						['projects/map.mmd', 'file'],
					]
			: profile === 'demo-project'
				? [
						['OKF.md', 'file'],
						['README.md', 'file'],
						['map.mmd', 'file'],
						['docs', 'dir'],
						['docs/index.md', 'file'],
						['docs/map.mmd', 'file'],
						['src', 'dir'],
						['src/lib/bapX-client.ts', 'file'],
					]
			: [
					['index.md', 'file'],
					['map.mmd', 'file'],
					['docs', 'dir'],
					['docs/index.md', 'file'],
					['docs/map.mmd', 'file'],
				];

	return requirements
		.map(([relPath, kind]) => validatePathRequirement(root, relPath, kind))
		.filter((missing): missing is string => missing !== undefined);
}

function mapCommand(args: MapArgs) {
	const root = args.explicitRoot ?? process.cwd();
	if (!isDirectory(root)) fail(`[bapX] Project root does not exist or is not a directory: ${root}`);

	const mapPath = path.join(root, 'map.mmd');
	const generated = generateProjectMap(root, args.profile);

	if (args.check) {
		if (!fs.existsSync(mapPath)) {
			fail(`[bapX] Missing project map: ${mapPath}\nRun \`bapX map --root ${shellQuote(root)}\`.`);
		}
		const current = fs.readFileSync(mapPath, 'utf8');
		if (current !== generated) {
			fail(
				`[bapX] Stale project map: ${mapPath}\nRun \`bapX map --root ${shellQuote(root)}\` and commit the updated map.mmd.`,
			);
		}
		const missing = validateMapProfile(root, args.profile);
		if (missing.length > 0) {
			fail(
				`[bapX] ${args.profile} is missing required path(s):\n${missing.map((item) => `  - ${item}`).join('\n')}`,
			);
		}
		success(`map.mmd is current for ${root}`);
		return;
	}

	fs.writeFileSync(mapPath, generated);
	const missing = validateMapProfile(root, args.profile);
	if (missing.length > 0) {
		fail(
			`[bapX] ${args.profile} is missing required path(s):\n${missing.map((item) => `  - ${item}`).join('\n')}`,
		);
	}
	success(`wrote ${path.relative(process.cwd(), mapPath) || mapPath}`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function buildCommand(args: BuildArgs) {
	const { cfg, configPath, envLoader } = await resolveApplicationCommand(args);
	try {
		await build({
			root: cfg.root,
			sourceRoot: cfg.sourceRoot,
			output: cfg.output,
			target: cfg.target,
			configFile: configPath,
			envFile: fs.existsSync(envLoader.file) ? envLoader.file : undefined,
		});
	} catch (err) {
		cliError(`Build failed: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(1);
	}
}

const INTERNAL_DEV_SESSION = 'FLUE_INTERNAL_DEV_SESSION';
const INTERNAL_DEV_READY = 'ready';

function readCliVersion(): string {
	const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
		version: string;
	};
	return pkg.version;
}

function devConfigFiles(args: DevArgs): string[] {
	const cwd = process.cwd();
	return resolveConfigCandidates({
		cwd,
		searchFrom: args.explicitRoot ?? cwd,
		configFile: args.configFile,
	});
}

async function devCommand(args: DevArgs) {
	const { cfg, envLoader, configPath, viteConfig } = await resolveApplicationCommand(args);
	try {
		// dev() blocks until SIGINT/SIGTERM exits the process. We don't expect
		// it to return; if it ever does, just exit cleanly.
		await dev({
			root: cfg.root,
			sourceRoot: cfg.sourceRoot,
			version: readCliVersion(),
			output: cfg.output,
			target: cfg.target,
			port: args.port || undefined,
			strictPort: args.port !== 0,
			envFile: envLoader.file,
			envLoader,
			configFiles: devConfigFiles(args),
			configFile: configPath,
			viteConfig,
			onReady: () => process.send?.(INTERNAL_DEV_READY),
		});
	} catch (err) {
		cliError(`Dev server failed: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(1);
	}
}

function superviseDevCommand(args: DevArgs) {
	const configFiles = devConfigFiles(args);
	const envLoader = loadCliEnvironment(args);
	const envFile = envLoader.file;
	envLoader.restore();
	const watchedFiles = new Set([...configFiles, envFile]);
	const configWatchInterval = 500;

	let child: ChildProcess | undefined;
	let restartTimer: NodeJS.Timeout | undefined;
	let restartRequested = false;
	let replacementSession = false;
	let sessionReady = false;
	let shuttingDown = false;

	const closeWatchers = () => {
		for (const file of watchedFiles) fs.unwatchFile(file);
	};
	const exit = (code: number) => {
		closeWatchers();
		process.exit(code);
	};
	const startSession = (replacement: boolean) => {
		const cliPath = process.argv[1];
		if (!cliPath) return exit(1);
		restartRequested = false;
		replacementSession = replacement;
		sessionReady = false;
		child = spawn(process.execPath, [cliPath, ...process.argv.slice(2)], {
			stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
			env: { ...process.env, [INTERNAL_DEV_SESSION]: '1' },
		});
		const session = child;
		session.on('message', (message) => {
			if (message === INTERNAL_DEV_READY) sessionReady = true;
		});
		session.once('exit', (code, signal) => {
			if (child !== session) return;
			child = undefined;
			if (shuttingDown) exit(signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : (code ?? 1));
			if (restartRequested) {
				if (!restartTimer) startSession(true);
				return;
			}
			if (replacementSession && !sessionReady) {
				cliError('Dev server restart failed. Waiting for a configuration change...');
				return;
			}
			exit(code ?? 1);
		});
	};
	const restart = (file: string) => {
		const kind = file === envFile ? 'env' : 'config';
		console.error(`${pc.dim(kind)} ${file} changed; restarting`);
		restartRequested = true;
		if (restartTimer) clearTimeout(restartTimer);
		restartTimer = setTimeout(() => {
			restartTimer = undefined;
			if (!child) startSession(true);
		}, 150);
		child?.kill('SIGTERM');
	};

	for (const file of watchedFiles) {
		fs.watchFile(file, { interval: configWatchInterval }, (current, previous) => {
			if (
				current.mtimeMs === previous.mtimeMs &&
				current.ctimeMs === previous.ctimeMs &&
				current.size === previous.size &&
				current.ino === previous.ino
			)
				return;
			restart(file);
		});
	}

	const shutdown = (signal: NodeJS.Signals) => {
		if (shuttingDown) return;
		shuttingDown = true;
		if (restartTimer) clearTimeout(restartTimer);
		closeWatchers();
		if (!child) return exit(signal === 'SIGINT' ? 130 : 143);
		child.kill(signal);
	};
	process.on('SIGINT', () => shutdown('SIGINT'));
	process.on('SIGTERM', () => shutdown('SIGTERM'));
	process.on('exit', () => child?.kill('SIGKILL'));
	startSession(false);
}

function displayPath(root: string, filePath: string): string {
	const relative = path.relative(root, filePath);
	return relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? relative : filePath;
}

let activeExecution: ExecutionLifecycle | undefined;

async function run(args: RunArgs) {
	let resourceKind: 'agent' | 'workflow' | undefined;
	const lifecycle = createExecutionLifecycle({
		resource: args.resource,
		target: args.target,
		server: args.server,
		headers: args.headers,
		explicitRoot: args.explicitRoot,
		explicitOutput: args.explicitOutput,
		configFile: args.configFile,
		envFile: args.envFile,
		instanceId: args.id,
		onRuntimeOutput: (line) => {
			if (line.trim()) console.error(pc.dim(line));
		},
		onResourceResolved: (resource) => {
			resourceKind = resource.kind;
		},
	});
	activeExecution = lifecycle;
	const presenter = createLineEventPresenter({
		write: (line) => console.error(line),
		dim: pc.dim,
		textHeading: pc.bold('assistant'),
		textIndent: '  ',
	});
	try {
		const execution = await lifecycle.start();
		const input = args.input === undefined ? undefined : JSON.parse(args.input);
		if (execution.resource.kind === 'agent' && input === undefined) {
			throw new Error('[bapX] Agent `bapX run` requires --input.');
		}
		brandRows('bapX run', [
			[execution.resource.kind, execution.resource.name],
			['id', execution.instanceId],
			['target', execution.target],
			['server', execution.baseUrl],
			[
				'config',
				execution.configPath && execution.root
					? displayPath(execution.root, execution.configPath)
					: undefined,
			],
			[
				'env',
				execution.envFile && execution.root
					? displayPath(execution.root, execution.envFile)
					: undefined,
			],
		]);
		const target =
			execution.resource.kind === 'agent'
				? {
						kind: 'agent' as const,
						name: execution.resource.name,
						instanceId: execution.instanceId as string,
						input: parseAgentInput(input),
					}
				: { kind: 'workflow' as const, name: execution.resource.name, input };
		if (target.kind === 'agent') {
			console.error('');
			console.error(pc.bold('user'));
			for (const line of target.input.message.split('\n')) console.error(`  ${line}`);
			console.error('');
		}
		let runIdShown = false;
		const completed = await runTarget(
			execution.client,
			target,
			(event: ConversationStreamChunk | BapxEvent) => {
				if (!runIdShown && event.type === 'run_start') {
					runIdShown = true;
					row('run', event.runId);
					console.error('');
				}
				presenter.present(event);
			},
			lifecycle.signal,
		);
		presenter.flush();
		if (completed.kind === 'workflow' && !runIdShown) row('run', completed.runId);
		if (completed.kind === 'workflow' && completed.result !== undefined && completed.result !== null) {
			console.error('');
			console.log(JSON.stringify(completed.result));
		}
		success(`${execution.resource.kind} completed`);
	} catch (err) {
		presenter.flush();
		if (!lifecycle.signal.aborted) {
			cliError(
				`${resourceKind === 'agent' ? 'Agent' : resourceKind === 'workflow' ? 'Workflow' : 'Run'} failed: ${err instanceof Error ? err.message : String(err)}`,
			);
			process.exitCode = 1;
		}
	} finally {
		try {
			await lifecycle.close();
		} finally {
			if (activeExecution === lifecycle) activeExecution = undefined;
		}
	}
}

// ─── `bapX init` ────────────────────────────────────────────────────────────

function renderConfigTemplate(target: 'node' | 'cloudflare'): string {
	return (
		`import { defineConfig } from '@bapX/cli/config';\n` +
		`\n` +
		`export default defineConfig({\n` +
		`\ttarget: '${target}',\n` +
		`});\n`
	);
}

function initCommand(args: InitArgs) {
	const targetDir = args.explicitRoot ?? process.cwd();

	if (!fs.existsSync(targetDir)) {
		cliError(`Target directory does not exist: ${targetDir}`);
		process.exit(1);
	}

	// Detect any existing bapX.config.* in the target dir, using the same
	// discovery rule the rest of the CLI uses. This catches `.mts`, `.js`,
	// etc. — not just `.ts`.
	let existing: string | undefined;
	try {
		existing = resolveConfigPath({ cwd: targetDir, configFile: undefined });
	} catch (err) {
		cliError(err instanceof Error ? err.message : String(err));
		process.exit(1);
	}

	if (existing && !args.force) {
		const rel = path.relative(process.cwd(), existing) || existing;
		cliError(`A Bapx config already exists at ${rel}.\n  Re-run with --force to overwrite.`);
		process.exit(1);
	}

	const outPath = path.join(targetDir, 'bapX.config.ts');
	const content = renderConfigTemplate(args.target);

	try {
		fs.writeFileSync(outPath, content);
	} catch (err) {
		cliError(`Failed to write ${outPath}: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(1);
	}

	const relOut = path.relative(process.cwd(), outPath) || outPath;
	console.error(brand(['bapX init', `target ${args.target}`, `wrote ${relOut}`]));

	// If --force overwrote a non-`.ts` variant, the new bapX.config.ts will
	// take precedence (CONFIG_BASENAMES priority), but the old file still
	// sits on disk. Surface that so the user isn't surprised later.
	if (existing && path.basename(existing) !== 'bapX.config.ts') {
		const relExisting = path.relative(process.cwd(), existing) || existing;
		note(
			`${relExisting} is still on disk. bapX.config.ts now takes precedence; delete the old file if you no longer need it.`,
		);
	}

	console.error('');
	note('next: fetch https://bapx.in/start.md to create a new agent');
}

// ─── `bapX add` ─────────────────────────────────────────────────────────────

// Default blueprint registry base. FLUE_REGISTRY_URL is an internal-only
// override used for local development against `npm run dev --workspace @bapX/www`.
const DEFAULT_REGISTRY_URL = 'https://bapx.in/cli/blueprints';

function registryUrlFor(slug: string): string {
	const base = (process.env.FLUE_REGISTRY_URL ?? DEFAULT_REGISTRY_URL).replace(/\/+$/, '');
	return `${base}/${slug}.md`;
}

function resolveBlueprint(kind: string, name: string): (typeof BLUEPRINTS)[number] | undefined {
	const blueprints = BLUEPRINTS.filter((blueprint) => blueprint.kind === kind);
	const bySlug = blueprints.find((blueprint) => blueprint.slug === name);
	if (bySlug) return bySlug;
	const byAlias = blueprints.find((blueprint) => blueprint.aliases.includes(name));
	if (byAlias) return byAlias;
	const lower = name.toLowerCase();
	return blueprints.find(
		(blueprint) =>
			blueprint.slug.toLowerCase() === lower ||
			blueprint.aliases.some((alias) => alias.toLowerCase() === lower),
	);
}

/**
 * Render a 3-column table aligned by the longest entry. Simple and
 * intentionally unfussy — blueprint listings are always small.
 */
function renderBlueprintTable(rows: { command: string; kind: string; website: string }[]): string {
	if (rows.length === 0) return '  (none)';
	const commandWidth = Math.max(...rows.map((row) => row.command.length));
	const kindWidth = Math.max(...rows.map((row) => row.kind.length));
	const gap = '     ';
	return rows
		.map(
			(row) =>
				`  ${row.command.padEnd(commandWidth)}${gap}${row.kind.padEnd(kindWidth)}${gap}${row.website}`,
		)
		.join('\n');
}

const blueprintResultByKind: Record<string, string> = {
	sandbox: 'sandbox adapter',
	database: 'database adapter',
	channel: 'channel',
	tooling: 'tooling integration',
};

function kindRootHint(): string {
	if (KIND_ROOTS.length === 0) return '';
	const lines: string[] = [];
	lines.push('');
	lines.push(`Don't see what you need?`);
	for (const root of KIND_ROOTS) {
		lines.push('');
		lines.push(`  bapX add ${root.kind} <url>`);
		lines.push(
			`    Build a ${blueprintResultByKind[root.kind] ?? root.kind} from scratch. Pass a URL pointing at the`,
		);
		lines.push(`    provider's docs (homepage, SDK reference, GitHub repo, anything useful) as`);
		lines.push(`    the agent's starting point. Pipe to your coding agent.`);
	}
	return lines.join('\n');
}

function availableBlueprintRows(kind?: string) {
	return BLUEPRINTS.filter((blueprint) => !kind || blueprint.kind === kind).map((blueprint) => ({
		command: `bapX add ${blueprint.kind} ${blueprint.slug}`,
		kind: blueprint.kind,
		website: blueprint.website,
	}));
}

function printListing(stream: NodeJS.WriteStream) {
	stream.write('bapX add <kind> <name|url>\n\n');
	stream.write('Available blueprints:\n');
	stream.write(renderBlueprintTable(availableBlueprintRows()));
	stream.write('\n');
	const hint = kindRootHint();
	if (hint) stream.write(`${hint}\n`);
}

function printUnknownBlueprint(kind: string, name: string, stream: NodeJS.WriteStream) {
	stream.write(`Blueprint "${name}" not found for kind "${kind}".\n\n`);
	stream.write(`Available ${kind} blueprints:\n`);
	stream.write(renderBlueprintTable(availableBlueprintRows(kind)));
	stream.write('\n\nTo build one from scratch with your coding agent:\n');
	stream.write(`  bapX add ${kind} <url>\n`);
}

async function fetchBlueprintMarkdown(
	slug: string,
): Promise<{ body: string } | { notFound: true }> {
	const url = registryUrlFor(slug);
	let res: Response;
	try {
		res = await fetch(url);
	} catch (err) {
		cliError(
			`Failed to reach the blueprint registry at ${url}.\n  ${err instanceof Error ? err.message : String(err)}`,
		);
		process.exit(1);
	}
	if (res.status === 404) return { notFound: true };
	if (!res.ok) {
		cliError(`Blueprint registry returned HTTP ${res.status} for ${url}.`);
		process.exit(1);
	}
	return { body: await res.text() };
}

// ─── bapX docs ───────────────────────────────────────────────────────────────

interface DocsPage {
	/** Page path without extension, e.g. `guide/sandboxes`. */
	path: string;
	title: string;
	description: string;
	/** Markdown body without frontmatter. */
	body: string;
}

/**
 * Locate the documentation markdown tree.
 *
 * For users of the published package this is always `<package root>/docs`,
 * placed there by `scripts/prepare-publish.mjs` at release time. Both `bin/`
 * (dev via tsx) and `dist/` (built) sit directly under the package root, so
 * the relative hop is identical in both contexts.
 *
 * The `apps/docs` candidate exists only for development inside the Bapx
 * monorepo itself and can never resolve in a user's `node_modules`. It is
 * checked first because in a repo checkout the docs site content is the
 * source of truth, and a stale `<package root>/docs` snapshot left behind by
 * a local release (gitignored, only refreshed at the next release) must not
 * shadow it.
 */
function resolveDocsRoot(): string | undefined {
	const here = path.dirname(fileURLToPath(import.meta.url));
	const candidates = [
		path.join(here, '../../../apps/docs/src/content/docs'),
		path.join(here, '../docs'),
	];
	return candidates.find((candidate) => fs.existsSync(candidate));
}

function parseDocsFrontmatter(source: string): { data: Record<string, string>; body: string } {
	if (!source.startsWith('---\n')) return { data: {}, body: source };
	const end = source.indexOf('\n---\n', 4);
	if (end === -1) return { data: {}, body: source };

	const data: Record<string, string> = {};
	for (const line of source.slice(4, end).split('\n')) {
		const match = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
		const key = match?.[1];
		let value = match?.[2]?.trim();
		if (!key || value === undefined) continue;
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		data[key] = value;
	}
	return { data, body: source.slice(end + '\n---\n'.length) };
}

function loadDocsPages(root: string): DocsPage[] {
	const pages: DocsPage[] = [];
	for (const entry of fs.readdirSync(root, { recursive: true, withFileTypes: true })) {
		if (!entry.isFile() || !/\.(md|mdx)$/.test(entry.name)) continue;
		const filePath = path.join(entry.parentPath, entry.name);
		const relative = path.relative(root, filePath).split(path.sep).join('/');
		const { data, body } = parseDocsFrontmatter(fs.readFileSync(filePath, 'utf8'));
		// `foo/index.md` is addressed as `foo`, matching the website's URLs.
		const pagePath = relative.replace(/\.(md|mdx)$/, '').replace(/\/index$/, '');
		pages.push({
			path: pagePath,
			title: data.title ?? relative,
			description: data.description ?? '',
			body,
		});
	}
	return pages.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Reduces markdown/MDX source to plain text for search indexing. This is
 * intentionally a lightweight approximation: minor artifacts are acceptable
 * since the output is only used for search matching and excerpts.
 */
function docsMarkdownToPlainText(source: string): string {
	return source
		.replace(/^(?:import|export)\s.*$/gm, '')
		.replace(/^```.*$/gm, '')
		.replace(/`([^`]*)`/g, '$1')
		.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/<\/?[A-Za-z][^>]*>/g, ' ')
		.replace(/^#{1,6}\s+/gm, '')
		.replace(/^>\s?/gm, '')
		.replace(/^\s*[-*+]\s+/gm, '')
		.replace(/^\s*\d+\.\s+/gm, '')
		.replace(/^\s*---+\s*$/gm, '')
		.replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
		.replace(/(^|\s)_{1,3}([^_]+)_{1,3}(?=[\s.,;:!?)]|$)/g, '$1$2')
		.replace(/\|/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function extractDocsHeadings(source: string): string {
	const matches = [...source.matchAll(/^#{2,4}\s+(.+)$/gm)];
	return matches.map((match) => docsMarkdownToPlainText(match[1] ?? '')).join(' ');
}

const DOCS_DESCRIPTION_MAX_LENGTH = 120;

function truncateDocsDescription(description: string): string {
	const characters = [...description];
	if (characters.length <= DOCS_DESCRIPTION_MAX_LENGTH) return description;
	const truncated = characters.slice(0, DOCS_DESCRIPTION_MAX_LENGTH - 1).join('');
	const boundary = truncated.search(/\s+\S*$/u);
	return boundary > 0 ? `${truncated.slice(0, boundary)}…` : '…';
}

const DOCS_EXCERPT_RADIUS = 120;

function buildDocsExcerpt(content: string, terms: string[]): string {
	const lowered = content.toLowerCase();
	let position = -1;
	for (const term of terms) {
		const index = lowered.indexOf(term.toLowerCase());
		if (index !== -1 && (position === -1 || index < position)) {
			position = index;
		}
	}
	if (position === -1) position = 0;

	const start = Math.max(0, position - DOCS_EXCERPT_RADIUS);
	const end = Math.min(content.length, position + DOCS_EXCERPT_RADIUS);
	const prefix = start > 0 ? '…' : '';
	const suffix = end < content.length ? '…' : '';
	return `${prefix}${content.slice(start, end).trim()}${suffix}`;
}

/** Accepts `guide/sandboxes`, `/docs/guide/sandboxes/`, full website URLs, and `.md`/`.mdx` paths. */
function normalizeDocsPath(input: string): string {
	let value = input.trim();
	if (/^https?:\/\//.test(value)) {
		try {
			value = new URL(value).pathname;
		} catch {
			// fall through with the raw value
		}
	}
	return value
		.replace(/^\.?\/+/, '')
		.replace(/^docs\//, '')
		.replace(/\/+$/, '')
		.replace(/\.(md|mdx)$/, '')
		.replace(/\/index$/, '');
}

function docsCommand(args: DocsArgs): void {
	const root = resolveDocsRoot();
	if (!root) {
		cliError(
			'Could not locate the bundled documentation. Your @bapX/cli installation may be incomplete — try reinstalling it.',
		);
		process.exit(1);
	}
	const pages = loadDocsPages(root);

	if (args.action === 'list') {
		process.stderr.write(
			'Bapx documentation\n\n' +
				'  bapX docs read <path>      Print a documentation page as markdown\n' +
				'  bapX docs search <query>   Search the documentation (JSON results)\n\n' +
				`Pages (${pages.length}):\n\n`,
		);
		for (const page of pages) {
			process.stdout.write(`${page.path} -- ${page.title}\n`);
			if (page.description && !page.path.startsWith('ecosystem/')) {
				process.stdout.write(`  ${truncateDocsDescription(page.description)}\n`);
			}
		}
		return;
	}

	if (args.action === 'read') {
		const target = normalizeDocsPath(args.value);
		const page = pages.find((candidate) => candidate.path === target);
		if (!page) {
			cliError(
				`Unknown docs page: ${args.value}\nRun \`bapX docs\` to list available pages, or \`bapX docs search <query>\` to find one.`,
			);
			process.exit(1);
		}
		let output = `# ${page.title}\n`;
		if (page.description) output += `\n> ${page.description}\n`;
		output += `\n${page.body.trim()}\n`;
		process.stdout.write(output);
		return;
	}

	const index = new MiniSearch({
		idField: 'path',
		fields: ['title', 'headings', 'description', 'content'],
		storeFields: ['title', 'description', 'content'],
		searchOptions: {
			boost: { title: 4, headings: 3, description: 2 },
			prefix: true,
			fuzzy: 0.2,
		},
	});
	index.addAll(
		pages.map((page) => ({
			path: page.path,
			title: page.title,
			description: page.description,
			headings: extractDocsHeadings(page.body),
			content: docsMarkdownToPlainText(page.body),
		})),
	);

	const results = index
		.search(args.value)
		.slice(0, 8)
		.map((result) => ({
			path: result.id as string,
			title: result.title as string,
			description: (result.description as string) || undefined,
			excerpt: buildDocsExcerpt((result.content as string) ?? '', result.terms),
			score: Math.round(result.score * 100) / 100,
		}));

	process.stdout.write(`${JSON.stringify({ query: args.value, results }, null, 2)}\n`);
	process.stderr.write('\nRead a page with: bapX docs read <path>\n');
}

function printHumanInstructions(args: BlueprintCommandArgs) {
	const cmd = `bapX ${args.command} ${args.kind} ${shellQuote(args.target)}`;
	const stream = process.stderr;
	stream.write(`${cmd}\n\n`);
	stream.write('To apply this blueprint, pipe it to your coding agent:\n\n');
	stream.write(`  ${cmd} --print | claude\n`);
	stream.write(`  ${cmd} --print | codex\n`);
	stream.write(`  ${cmd} --print | cursor-agent\n`);
	stream.write(`  ${cmd} --print | opencode\n`);
	stream.write(`  ${cmd} --print | pi\n\n`);
	stream.write('Or paste this prompt into any agent:\n\n');
	stream.write(`  Run "${cmd} --print" and follow the instructions.\n`);
}

/**
 * Shared tail of blueprint commands: fetch blueprint Markdown for `slug`, then write
 * it to stdout in agent mode or print human instructions. `substituteUrl`
 * replaces `{{URL}}` placeholders in kind-root blueprints.
 */
async function emitBlueprintMarkdown(
	args: BlueprintCommandArgs,
	opts: { slug: string; notFoundLabel: string; substituteUrl?: string },
) {
	const result = await fetchBlueprintMarkdown(opts.slug);
	if ('notFound' in result) {
		cliError(
			`The blueprint registry did not have Markdown for ${opts.notFoundLabel}. Your installed CLI may be out of sync with the registry — try updating @bapX/cli.`,
		);
		process.exit(1);
	}

	const body =
		opts.substituteUrl === undefined
			? result.body
			: result.body.replaceAll('{{URL}}', opts.substituteUrl);

	const isAgentMode =
		args.print || (await determineAgent().catch(() => ({ isAgent: false }))).isAgent === true;
	if (isAgentMode) {
		process.stdout.write(body);
		if (!body.endsWith('\n')) process.stdout.write('\n');
		return;
	}
	printHumanInstructions(args);
}

async function blueprintCommand(args: BlueprintCommandArgs) {
	if (args.command === 'add' && !args.kind && !args.target) {
		printListing(process.stderr);
		return;
	}

	const root = KIND_ROOTS.find((entry) => entry.kind === args.kind);
	if (!root) {
		cliError(
			`Unknown blueprint kind "${args.kind}". Known kinds: ${KIND_ROOTS.map((entry) => entry.kind).join(', ') || '(none)'}`,
		);
		process.exit(1);
	}

	let url: URL | undefined;
	try {
		url = new URL(args.target);
	} catch {}

	if (url) {
		await emitBlueprintMarkdown(args, {
			slug: root.kind,
			notFoundLabel: `kind "${args.kind}"`,
			substituteUrl: args.target,
		});
		return;
	}

	const known = resolveBlueprint(args.kind, args.target);
	if (!known) {
		printUnknownBlueprint(args.kind, args.target, process.stderr);
		process.exit(1);
	}

	await emitBlueprintMarkdown(args, { slug: known.slug, notFoundLabel: `"${known.slug}"` });
}

// ─── Entry Point ────────────────────────────────────────────────────────────

const args = parseArgs(process.argv.slice(2));

// `dev` manages its own supervisor shutdown, so it skips the hard-exit
// handlers that would otherwise run first and preempt its graceful path.
if (args.command !== 'dev') {
	const shutdown = (signal: NodeJS.Signals) => {
		if (activeExecution) {
			void closeExecutionForSignal(signal, activeExecution).catch((error) => {
				cliError(error instanceof Error ? error.message : String(error));
			});
		} else {
			process.exitCode = signal === 'SIGINT' ? 130 : 143;
		}
	};
	process.on('SIGINT', () => shutdown('SIGINT'));
	process.on('SIGTERM', () => shutdown('SIGTERM'));
}

async function main() {
	if (args.command === 'build') {
		await buildCommand(args);
	} else if (args.command === 'dev') {
		if (process.env[INTERNAL_DEV_SESSION] === '1') {
			delete process.env[INTERNAL_DEV_SESSION];
			await devCommand(args);
		} else superviseDevCommand(args);
	} else if (args.command === 'add' || args.command === 'update') {
		await blueprintCommand(args);
	} else if (args.command === 'docs') {
		docsCommand(args);
	} else if (args.command === 'init') {
		initCommand(args);
	} else if (args.command === 'map') {
		mapCommand(args);
	} else if (args.command === 'run') {
		await run(args);
	}
}

void main().then(
	() => {
		if (args.command === 'run') process.exit(process.exitCode ?? 0);
	},
	(err) => {
		cliError(err instanceof Error ? err.message : String(err));
		if (process.exitCode === undefined) process.exitCode = 1;
		if (args.command === 'run') process.exit(process.exitCode);
	},
);
