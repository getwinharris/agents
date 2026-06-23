import { afterEach, describe, expect, it, vi } from 'vitest';
import { boundedShutdown, closeExecutionForSignal } from '../src/lib/console-shutdown.ts';
import type { ExecutionLifecycle } from '../src/lib/execution-lifecycle.ts';

const originalExitCode = process.exitCode;

afterEach(() => {
	process.exitCode = originalExitCode;
	vi.useRealTimers();
});

describe('boundedShutdown()', () => {
	it('force-cleans and terminates after the cleanup bound', async () => {
		vi.useFakeTimers();
		const forceCloseSync = vi.fn();
		const terminate = vi.fn();
		const shutdown = boundedShutdown({
			close: () => new Promise<void>(() => {}),
			forceCloseSync,
			exitCode: 130,
			timeoutMs: 10,
			terminate,
		});

		await vi.advanceTimersByTimeAsync(10);
		await shutdown;

		expect(forceCloseSync).toHaveBeenCalledOnce();
		expect(terminate).toHaveBeenCalledWith(130);
	});
});

describe('closeExecutionForSignal()', () => {
	it('cancels run execution before bounded cleanup', async () => {
		const cancel = vi.fn();
		const close = vi.fn(async () => {});
		const lifecycle = { cancel, close, forceCloseSync: vi.fn() } as unknown as ExecutionLifecycle;

		await closeExecutionForSignal('SIGTERM', lifecycle, vi.fn());

		expect(cancel).toHaveBeenCalledOnce();
		expect(close).toHaveBeenCalledOnce();
		expect(process.exitCode).toBe(143);
	});
});
