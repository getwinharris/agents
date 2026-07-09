import * as path from 'node:path';
import {
	createBuildContext,
	createSharedViteConfig,
	viteGeneratedEntryDependencyResolver,
} from './build.ts';
import { NodePlugin } from './build-plugin-node.ts';
import type { LocalHttpRuntimeOutput } from './local-http-runtime.ts';
import type { LoadedNodeApplication } from './node-http-listener.ts';
import { withScopedConsoleCapture } from './scoped-console-capture.ts';

const virtualEntry = 'virtual:bapX/node-local-bootstrap';
const resolvedEntry = '\0virtual:bapX/node-local-bootstrap';

export interface NodeApplicationLoader {
	load(): Promise<LoadedNodeApplication>;
	close(): Promise<void>;
}

export async function createNodeApplicationLoader(options: {
	root: string;
	sourceRoot: string;
	temporaryLocalExposure: boolean;
	env?: NodeJS.ProcessEnv;
	onOutput?: (output: LocalHttpRuntimeOutput) => void;
	internalDevLogs?: boolean;
	viteConfig?: import('vite').UserConfig;
	onWatchChange?: (filePath: string) => void;
}): Promise<NodeApplicationLoader> {
	let server: Awaited<ReturnType<(typeof import('vite'))['createServer']>> | undefined;

	async function close(): Promise<void> {
		const current = server;
		server = undefined;
		await current?.close();
	}

	return {
		async load() {
			const previousServer = server;
			const ctx = createBuildContext({
				root: options.root,
				sourceRoot: options.sourceRoot,
				output: options.root,
				target: 'node',
				temporaryLocalExposure: options.temporaryLocalExposure,
			});
			if (ctx.agents.length === 0 && ctx.workflows.length === 0) {
				throw new Error(
					`[bapX] No agent or workflow files found.\n\nExpected at: ${path.join(options.sourceRoot, 'agents')}/ or ${path.join(options.sourceRoot, 'workflows')}/\nAdd at least one agent or workflow file.`,
				);
			}
			const code = new NodePlugin().generateRuntimeEntryPoint(ctx);
			const shared = createSharedViteConfig(options.root);
			const { createServer, mergeConfig } = await import('vite');
			const merged = mergeConfig(shared, options.viteConfig ?? {});
			const viteServer = await createServer({
				...merged,
				configFile: false,
				root: options.root,
				appType: 'custom',
				logLevel: 'silent',
				resolve: { ...merged.resolve, preserveSymlinks: true },
				optimizeDeps: { ...merged.optimizeDeps, noDiscovery: true, include: [] },
				server: {
					...merged.server,
					middlewareMode: true,
					hmr: false,
				},
				plugins: [
					...(merged.plugins ?? []),
					{
						name: 'bapX-node-local-bootstrap',
						resolveId(id: string) {
							if (id === virtualEntry) return resolvedEntry;
						},
						load(id: string) {
							if (id === resolvedEntry) return code;
						},
					},
					viteGeneratedEntryDependencyResolver(options.root, {
						external: true,
						importers: [resolvedEntry],
					}),
				],
			});
			try {
				const loaded = (await withScopedConsoleCapture(options.onOutput, () =>
					viteServer.ssrLoadModule(virtualEntry),
				)) as {
					loadBapxNodeApplication(options: object): Promise<LoadedNodeApplication>;
				};
				const application = await loaded.loadBapxNodeApplication({
					local: true,
					env: { ...process.env, ...options.env },
					onOutput: options.onOutput,
					internalDevLogs: options.internalDevLogs,
				});
				if (options.onWatchChange) {
					const onChange = options.onWatchChange;
					viteServer.watcher.on('all', (_event, filePath) => onChange(filePath));
				}
				server = viteServer;
				try {
					await previousServer?.close();
				} catch {}
				return application;
			} catch (error) {
				await viteServer.close();
				throw error;
			}
		},
		close,
	};
}
