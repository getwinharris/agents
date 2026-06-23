const SHUTDOWN_TIMEOUT_MS = 5000;

export interface BoundedShutdownOptions {
	close(): Promise<void>;
	forceCloseSync(): void;
	exitCode: number;
	beforeTerminate?: () => void;
	terminate?: (code: number) => unknown;
}

export async function boundedShutdown(options: BoundedShutdownOptions): Promise<void> {
	process.exitCode = options.exitCode;
	let timer: NodeJS.Timeout | undefined;
	let timedOut = false;
	try {
		const closing = Promise.resolve().then(() => options.close());
		void closing.catch(() => {});
		await Promise.race([
			closing,
			new Promise<void>((resolve) => {
				timer = setTimeout(() => {
					timedOut = true;
					resolve();
				}, SHUTDOWN_TIMEOUT_MS);
			}),
		]);
	} finally {
		if (timer) clearTimeout(timer);
		if (timedOut) {
			options.forceCloseSync();
			options.beforeTerminate?.();
			(options.terminate ?? process.exit)(options.exitCode);
		}
	}
}
