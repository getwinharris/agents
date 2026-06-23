import * as fs from 'node:fs';
import path from 'node:path';
import { createFlueClient, type FlueClient } from '@flue/sdk';
import { ulid } from 'ulidx';
import { type FlueConfig, resolveConfig, resolveConfigPath, type UserFlueConfig } from './config.ts';
import { createEnvLoader, type EnvLoader, selectEnvFile } from './env.ts';
import {
	type LocalHttpRuntime,
	type LocalHttpRuntimeOutput,
	startLocalHttpRuntime,
} from './local-http-runtime.ts';
import { assertRunIdAllowed } from './run-controller.ts';
import { isAbsoluteServer, parseHeaders, resolveServerUrl } from './run-http.ts';
import { type RunResource, resolveRunResource } from './run-resource.ts';

export interface ExecutionLifecycleOptions {
	resource: string;
	target?: 'node' | 'cloudflare';
	server?: string;
	headers?: string[];
	explicitRoot?: string;
	explicitOutput?: string;
	configFile?: string;
	envFile?: string;
	instanceId?: string;
	onRuntimeOutput?: (line: string, stream: LocalHttpRuntimeOutput['stream']) => void;
	onResourceResolved?: (resource: RunResource) => void;
}

interface PreparedExecution {
	readonly resource: RunResource;
	readonly instanceId: string | undefined;
	readonly target: 'node' | 'cloudflare' | undefined;
	readonly root: string | undefined;
	readonly configPath: string | undefined;
	readonly envFile: string | undefined;
	readonly remote: boolean;
}

interface StartedExecution extends PreparedExecution {
	readonly client: FlueClient;
	readonly baseUrl: string;
}

export interface ExecutionLifecycle {
	readonly signal: AbortSignal;
	start(): Promise<StartedExecution>;
	cancel(reason?: unknown): void;
	close(): Promise<void>;
	forceCloseSync(): void;
}

interface LocalApplication {
	cfg: FlueConfig;
	configPath?: string;
	envLoader: EnvLoader;
	envFile?: string;
}

export function createExecutionLifecycle(options: ExecutionLifecycleOptions): ExecutionLifecycle {
	const controller = new AbortController();
	let runtime: LocalHttpRuntime | undefined;
	let application: LocalApplication | undefined;
	let cloudflareScratch: Map<string, string | undefined> | undefined;
	let cloudflareInputDirExisted = true;
	let prepared: Promise<PreparedExecution> | undefined;
	let started: Promise<StartedExecution> | undefined;
	let closePromise: Promise<void> | undefined;
	let cleaned = false;

	const cleanupSync = () => {
		if (cleaned) return;
		cleaned = true;
		if (cloudflareScratch) restoreFiles(cloudflareScratch);
		if (!cloudflareInputDirExisted && application) {
			const inputDir = path.join(application.cfg.root, '.flue-vite');
			try {
				if (fs.readdirSync(inputDir).length === 0) fs.rmdirSync(inputDir);
			} catch {}
		}
		application?.envLoader.restore();
	};
	const forceCloseSync = () => {
		controller.abort(new DOMException('Aborted', 'AbortError'));
		runtime?.killSync();
		cleanupSync();
	};
	const closeResources = async () => {
		let stopError: unknown;
		try {
			await runtime?.stop();
		} catch (error) {
			stopError = error;
		} finally {
			cleanupSync();
		}
		if (stopError) throw stopError;
	};
	const close = (): Promise<void> => {
		if (closePromise) return closePromise;
		closePromise = (async () => {
			await started?.catch(() => undefined);
			await closeResources();
		})();
		return closePromise;
	};

	return {
		signal: controller.signal,
		start() {
			if (started) return started;
			started = start();
			return started;
		},
		cancel(reason = new DOMException('Aborted', 'AbortError')) {
			controller.abort(reason);
		},
		close,
		forceCloseSync,
	};

	async function prepare(): Promise<PreparedExecution> {
		try {
			throwIfAborted(controller.signal);
			const remote = isAbsoluteServer(options.server);
			const resource = remote
				? resolveRemoteResource(options.resource)
				: await resolveLocalResource(options.resource);
			options.onResourceResolved?.(resource);
			assertRunIdAllowed(resource.kind, options.instanceId);
			throwIfAborted(controller.signal);
			return {
				resource,
				instanceId: resource.kind === 'agent' ? (options.instanceId ?? ulid()) : undefined,
				target: application?.cfg.target,
				root: application?.cfg.root,
				configPath: application?.configPath,
				envFile: application?.envFile,
				remote,
			};
		} catch (error) {
			await closeResources();
			throw error;
		}
	}

	async function start(): Promise<StartedExecution> {
		try {
			if (!prepared) prepared = prepare();
			const preparedExecution = await prepared;
			if (!preparedExecution.remote) await startLocalRuntime();
			const baseUrl = preparedExecution.remote
				? resolveServerUrl(options.server)
				: resolveServerUrl(options.server, runtime?.url as string);
			return {
				...preparedExecution,
				client: createFlueClient({ baseUrl, headers: parseHeaders(options.headers ?? []) }),
				baseUrl,
			};
		} catch (error) {
			await closeResources();
			throw error;
		}
	}

	async function resolveLocalResource(resourceName: string): Promise<RunResource> {
		application = await resolveLocalApplication(options);
		throwIfAborted(controller.signal);
		return resolveRunResource(application.cfg.sourceRoot, resourceName);
	}

	async function startLocalRuntime(): Promise<void> {
		if (!application) throw new Error('[flue] Local application was not resolved.');
		if (application.cfg.target === 'cloudflare') {
			cloudflareInputDirExisted = fs.existsSync(path.join(application.cfg.root, '.flue-vite'));
			cloudflareScratch = snapshotFiles([
				path.join(application.cfg.root, '.flue-vite', '_entry.ts'),
				path.join(application.cfg.root, '.flue-vite.wrangler.jsonc'),
			]);
		}
		runtime = await startLocalHttpRuntime({
			root: application.cfg.root,
			sourceRoot: application.cfg.sourceRoot,
			output: application.cfg.target === 'cloudflare' ? application.cfg.output : undefined,
			target: application.cfg.target,
			configFile: application.configPath,
			envFile: application.envFile,
			env: process.env,
			signal: controller.signal,
			onOutput: ({ line, stream }) => options.onRuntimeOutput?.(line, stream),
		});
	}
}

async function resolveLocalApplication(options: ExecutionLifecycleOptions): Promise<LocalApplication> {
	const cwd = process.cwd();
	const searchFrom = options.explicitRoot ?? cwd;
	const initialConfigPath =
		options.configFile !== undefined
			? resolveConfigPath({ cwd, configFile: options.configFile })
			: resolveConfigPath({ cwd: searchFrom, configFile: undefined });
	const baseDir = initialConfigPath ? path.dirname(initialConfigPath) : searchFrom;
	const envLoader = createEnvLoader(selectEnvFile(options.envFile, baseDir));
	envLoader.apply();
	try {
		const inline: UserFlueConfig = {};
		if (options.target) inline.target = options.target;
		if (options.explicitRoot) inline.root = options.explicitRoot;
		if (options.explicitOutput) inline.output = options.explicitOutput;
		const { flueConfig: cfg, configPath } = await resolveConfig({
			cwd,
			searchFrom,
			configFile: options.configFile,
			inline,
		});
		return {
			cfg,
			configPath,
			envLoader,
			envFile: fs.existsSync(envLoader.file) ? envLoader.file : undefined,
		};
	} catch (error) {
		envLoader.restore();
		throw error;
	}
}

function resolveRemoteResource(value: string): RunResource {
	const qualified = value.match(/^(agent|workflow):(.+)$/);
	if (!qualified) {
		throw new Error(
			`[flue] Absolute --server requires a qualified resource: agent:${value} or workflow:${value}.`,
		);
	}
	return {
		kind: qualified[1] as RunResource['kind'],
		name: qualified[2] as string,
		filePath: '',
	};
}

function snapshotFiles(paths: readonly string[]): Map<string, string | undefined> {
	return new Map(paths.map((file) => [file, fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined]));
}

function restoreFiles(snapshot: ReadonlyMap<string, string | undefined>): void {
	for (const [file, content] of snapshot) {
		if (content === undefined) {
			fs.rmSync(file, { force: true });
		} else {
			fs.mkdirSync(path.dirname(file), { recursive: true });
			fs.writeFileSync(file, content);
		}
	}
}

function throwIfAborted(signal: AbortSignal): void {
	if (signal.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
}
