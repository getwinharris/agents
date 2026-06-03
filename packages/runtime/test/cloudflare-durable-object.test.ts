import { describe, expect, it, vi } from 'vitest';
import { fetchCloudflareDurableObject } from '../src/cloudflare/durable-object.ts';

function retryableError(): Error & { retryable: boolean } {
	return Object.assign(new Error('retryable'), { retryable: true });
}

describe('fetchCloudflareDurableObject()', () => {
	it('recreates the stub when a replay-safe request receives a retryable infrastructure error', async () => {
		const fetch = vi
			.fn()
			.mockRejectedValueOnce(retryableError())
			.mockResolvedValueOnce(new Response('ok'));
		const namespace = {
			idFromName: vi.fn(() => ({})),
			get: vi.fn(() => ({ fetch })),
		};

		const response = await fetchCloudflareDurableObject(
			namespace,
			'customer-123',
			new Request('https://flue.test/agents/assistant/customer-123'),
			{ retry: true },
		);

		expect(await response.text()).toBe('ok');
		expect(namespace.idFromName).toHaveBeenCalledTimes(2);
		expect(namespace.get).toHaveBeenCalledTimes(2);
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it('does not retry requests unless replay safety is explicit', async () => {
		const error = retryableError();
		const fetch = vi.fn().mockRejectedValue(error);
		const namespace = {
			idFromName: vi.fn(() => ({})),
			get: vi.fn(() => ({ fetch })),
		};

		await expect(
			fetchCloudflareDurableObject(
				namespace,
				'customer-123',
				new Request('https://flue.test/agents/assistant/customer-123'),
			),
		).rejects.toBe(error);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('does not retry overloaded infrastructure errors', async () => {
		const error = Object.assign(new Error('overloaded'), { overloaded: true, retryable: true });
		const fetch = vi.fn().mockRejectedValue(error);
		const namespace = {
			idFromName: vi.fn(() => ({})),
			get: vi.fn(() => ({ fetch })),
		};

		await expect(
			fetchCloudflareDurableObject(
				namespace,
				'customer-123',
				new Request('https://flue.test/agents/assistant/customer-123'),
				{ retry: true },
			),
		).rejects.toBe(error);
		expect(fetch).toHaveBeenCalledTimes(1);
	});
});
