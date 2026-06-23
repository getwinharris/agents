import { describe, expect, it } from 'vitest';
import { createExecutionLifecycle } from '../src/lib/execution-lifecycle.ts';

describe('createExecutionLifecycle()', () => {
	it('starts a remote attachment without resolving a local project when the server is absolute', async () => {
		const lifecycle = createExecutionLifecycle({
			resource: 'workflow:deploy',
			server: 'https://example.com/flue',
			headers: ['Authorization: Bearer token'],
		});

		const execution = await lifecycle.start();

		expect(execution.resource).toMatchObject({ kind: 'workflow', name: 'deploy' });
		expect(execution.baseUrl).toBe('https://example.com/flue');
		expect(execution.remote).toBe(true);
		expect(execution.target).toBeUndefined();
		await expect(lifecycle.close()).resolves.toBeUndefined();
		await expect(lifecycle.close()).resolves.toBeUndefined();
	});

	it('rejects startup when cancelled before asynchronous setup begins', async () => {
		const lifecycle = createExecutionLifecycle({
			resource: 'workflow:deploy',
			server: 'https://example.com/flue',
		});
		lifecycle.cancel();

		await expect(lifecycle.start()).rejects.toMatchObject({ name: 'AbortError' });
		await expect(lifecycle.close()).resolves.toBeUndefined();
	});

	it('exposes idempotent synchronous emergency cleanup', async () => {
		const lifecycle = createExecutionLifecycle({
			resource: 'workflow:deploy',
			server: 'https://example.com/flue',
		});
		await lifecycle.start();

		expect(() => lifecycle.forceCloseSync()).not.toThrow();
		expect(() => lifecycle.forceCloseSync()).not.toThrow();
		await expect(lifecycle.close()).resolves.toBeUndefined();
	});
});
