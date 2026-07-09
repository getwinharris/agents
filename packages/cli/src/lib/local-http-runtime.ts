import { createServer } from 'node:net';
import * as path from 'node:path';
import { build, cloudflareViteConfigPath, createCloudflareViteConfig } from './build.ts';
import { createNodeLocalRuntime } from './node-local-runtime.ts';
import type { BuildOptions } from './types.ts';

export interface LocalHttpRuntimeOutput {
	stream: 'stdout' | 'stderr';
	line: string;
}

export interface StartLocalHttpRuntimeOptions {
	root: string;
	sourceRoot: string;
	target: 'node' | 'cloudflare';
	output?: string;
	port?: number;
	configFile?: string;
	envFile?: string;
	env?: NodeJS.ProcessEnv;
	onOutput?: (output: LocalHttpRuntimeOutput) => void;
	onBuildComplete?: () => void;
	signal?: AbortSignal;
}

export interface LocalHttpRuntime {
	readonly target: 'node' | 'cloudflare';
	readonly port: number;
	readonly url: string;
	reload(): Promise<void>;
	stop(): Promise<void>;
	killSync(): void;
}

export interface StartCloudflareLocalRuntimeOptions {
	root: string;
	port: number;
	stopTimeoutMs?: number;
	watch?: boolean;
	viteConfig?: import('vite').UserConfig;
	onWatchChange?: (filePath: string) => void;
	cloudflareLogLevel?: 'silent' | 'info';
}

interface StartedRuntime {
	port: number;
	url: string;
	reload(): Promise<void>;
	stop(): Promise<void>;
	killSync(): void;
}

export async function startLocalHttpRuntime(
	options: StartLocalHttpRuntimeOptions,
): Promise<LocalHttpRuntime> {
	const root = path.resolve(options.root);
	const sourceRoot = path.resolve(options.sourceRoot);
	throwIfAborted(options.signal);
	const port = options.port ?? (await selectAvailablePort());
	throwIfAborted(options.signal);
	if (options.target === 'node') {
		const runtime = await startInMemoryNodeRuntime({ ...options, root, sourceRoot, port });
		options.onBuildComplete?.();
		return { target: 'node', ...runtime };
	}
	const output = path.resolve(options.output ?? path.join(root, 'dist'));
	const buildOptions: BuildOptions = {
		root,
		sourceRoot,
		output,
		target: options.target,
		mode: 'development',
		log: 'silent',
		configFile: options.configFile,
		envFile: options.envFile,
		temporaryLocalExposure: true,
	};
	await build(buildOptions);
	options.onBuildComplete?.();
	throwIfAborted(options.signal);
	const started = await startCloudflareLocalRuntime({ root, port, watch: false });
	return { target: 'cloudflare', ...started };
}

async function startInMemoryNodeRuntime(
	options: StartLocalHttpRuntimeOptions & { root: string; sourceRoot: string; port: number },
): Promise<StartedRuntime> {
	const runtime = await createNodeLocalRuntime({
		root: options.root,
		sourceRoot: options.sourceRoot,
		port: options.port,
		temporaryLocalExposure: true,
		cors: true,
		hostname: '127.0.0.1',
		env: options.env,
		onOutput: options.onOutput,
	});
	try {
		throwIfAborted(options.signal);
		await runtime.start();
		throwIfAborted(options.signal);
	} catch (error) {
		await runtime.stop().catch(() => runtime.closeSync());
		throw error;
	}
	return {
		port: runtime.port,
		url: runtime.url,
		reload: () => runtime.reload(),
		stop: () => runtime.stop(),
		killSync: () => runtime.closeSync(),
	};
}

export async function startCloudflareLocalRuntime(
	options: StartCloudflareLocalRuntimeOptions,
): Promise<StartedRuntime> {
	const restoreWarnings = suppressPunycodeDeprecation();
	const originalNoDeprecation = process.noDeprecation;
	process.noDeprecation = true;
	const originalNodeOptions = process.env.NODE_OPTIONS;
	process.env.NODE_OPTIONS = [originalNodeOptions, '--disable-warning=DEP0040']
		.filter(Boolean)
		.join(' ');
	try {
		const [{ cloudflare }, { createServer, mergeConfig }] = await Promise.all([
			import('@cloudflare/vite-plugin'),
			import('vite'),
		]);
		const baseConfig = createCloudflareViteConfig(
			cloudflare,
			options.root,
			cloudflareViteConfigPath(options.root),
		);
		const merged = mergeConfig(baseConfig, options.viteConfig ?? {});
		const watchPlugin = options.onWatchChange
			? {
					name: 'bapX-dev-watch',
					configureServer(server: Awaited<ReturnType<typeof createServer>>) {
						server.watcher.on('all', (_event, filePath) => options.onWatchChange?.(filePath));
					},
				}
			: undefined;
		const server = await createServer({
			...merged,
			configFile: false,
			root: options.root,
			plugins: [...(merged.plugins ?? []), ...(watchPlugin ? [watchPlugin] : [])],
			logLevel: options.cloudflareLogLevel ?? 'silent',
			server: {
				...merged.server,
				host: '127.0.0.1',
				port: options.port,
				strictPort: true,
				...(options.watch ? {} : { hmr: false, watch: { ignored: ['**/*'] } }),
			},
		});
		try {
			await server.listen();
		} catch (error) {
			await closeViteServer(server, options.stopTimeoutMs ?? 5_000).catch(() => {});
			throw error;
		}
		const url =
			server.resolvedUrls?.local[0]?.replace(/\/$/, '') ?? `http://127.0.0.1:${options.port}`;
		let restored = false;
		const restore = () => {
			if (restored) return;
			restored = true;
			process.noDeprecation = originalNoDeprecation;
			if (originalNodeOptions === undefined) delete process.env.NODE_OPTIONS;
			else process.env.NODE_OPTIONS = originalNodeOptions;
			restoreWarnings();
		};
		return {
			port: options.port,
			url,
			reload: () => server.restart(),
			stop: async () => {
				try {
					await closeViteServer(server, options.stopTimeoutMs ?? 5_000);
				} finally {
					restore();
				}
			},
			killSync: restore,
		};
	} catch (error) {
		process.noDeprecation = originalNoDeprecation;
		if (originalNodeOptions === undefined) delete process.env.NODE_OPTIONS;
		else process.env.NODE_OPTIONS = originalNodeOptions;
		restoreWarnings();
		throw error;
	}
}

async function closeViteServer(
	server: Awaited<ReturnType<(typeof import('vite'))['createServer']>>,
	timeoutMs: number,
): Promise<void> {
	const close = server.close();
	let timer: NodeJS.Timeout | undefined;
	try {
		await Promise.race([
			close,
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => {
					const httpServer = server.httpServer;
					if (httpServer && 'closeAllConnections' in httpServer) httpServer.closeAllConnections();
					reject(new Error(`Timed out closing Cloudflare Vite server after ${timeoutMs}ms.`));
				}, timeoutMs);
				timer.unref();
			}),
		]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

function suppressPunycodeDeprecation(): () => void {
	const original = process.emitWarning;
	process.emitWarning = ((warning: string | Error, ...args: unknown[]) => {
		const message = warning instanceof Error ? warning.message : String(warning);
		const code =
			warning instanceof Error
				? (warning as Error & { code?: string }).code
				: typeof args[1] === 'string'
					? args[1]
					: undefined;
		if (code === 'DEP0040' || message.includes('`punycode` module is deprecated')) return;
		return Reflect.apply(original, process, [warning, ...args]);
	}) as typeof process.emitWarning;
	return () => {
		if (process.emitWarning !== original) process.emitWarning = original;
	};
}

function throwIfAborted(signal?: AbortSignal): void {
	if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
}

async function selectAvailablePort(): Promise<number> {
	return new Promise<number>((resolve, reject) => {
		const server = createServer();
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			if (!address || typeof address === 'string') {
				server.close();
				reject(new Error('Unable to select an available local HTTP port.'));
				return;
			}
			server.close((error) => (error ? reject(error) : resolve(address.port)));
		});
	});
}
