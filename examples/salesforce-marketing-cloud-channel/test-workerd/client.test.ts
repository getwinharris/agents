import { describe, expect, it, vi } from 'vitest';
import { createSalesforceMarketingCloudClient } from '../src/salesforce-marketing-cloud-client.ts';

describe('SalesforceMarketingCloudClient', () => {
	it('retrieves the bound ENS callback through injected Fetch in workerd with nodejs_compat', async () => {
		const callbackId = '1fbe12a3-8437-4768-a53a-775aa74d3424';
		const expectedUrl = `https://worker-tenant.rest.marketingcloudapis.com/platform/v1/ens-callbacks/${callbackId}`;
		const fetcher = vi.fn<typeof globalThis.fetch>(async (input, init) => {
			const request = new Request(input, init);
			if (request.url !== expectedUrl) {
				throw new Error(`Unexpected network destination: ${request.url}`);
			}
			expect(request.method).toBe('GET');
			expect(request.headers.get('accept')).toBe('application/json');
			expect(request.headers.get('authorization')).toBe('Bearer sfmc-worker-test-token');
			return Response.json({
				callbackId,
				callbackName: 'Worker lifecycle callback',
				url: 'https://worker.example.test/channels/salesforce-marketing-cloud/events',
				maxBatchSize: 500,
				status: 'verified',
				statusReason: 'none',
			});
		});
		const client = createSalesforceMarketingCloudClient({
			restBaseUrl: 'https://worker-tenant.rest.marketingcloudapis.com',
			accessToken: 'sfmc-worker-test-token',
			fetcher,
		});

		const callback = await client.getCallback(callbackId);

		expect(callback.callbackName).toBe('Worker lifecycle callback');
		expect(callback.maxBatchSize).toBe(500);
		expect(fetcher).toHaveBeenCalledOnce();
		expect(globalThis.process).toBeDefined();
		expect(globalThis.Buffer).toBeDefined();
	});
});
