import { describe, expect, it, vi } from 'vitest';
import {
	createSalesforceMarketingCloudClient,
	salesforceMarketingCloudRestOrigin,
} from '../src/salesforce-marketing-cloud-client.ts';
import {
	emailEventInstanceId,
	emailRefFromEvent,
	parseEmailEventInstanceId,
	type SalesforceMarketingCloudEmailRef,
} from '../src/salesforce-marketing-cloud-email.ts';

describe('SalesforceMarketingCloudClient', () => {
	it('retrieves the bound ENS callback through injected Fetch in Node', async () => {
		const callbackId = '4e2702e0-67d6-45c8-83c1-4a88be664981';
		const expectedUrl = `https://node-tenant.rest.marketingcloudapis.com/platform/v1/ens-callbacks/${callbackId}`;
		const fetcher = vi.fn<typeof globalThis.fetch>(async (input, init) => {
			const request = new Request(input, init);
			if (request.url !== expectedUrl) {
				throw new Error(`Unexpected network destination: ${request.url}`);
			}
			expect(request.method).toBe('GET');
			expect(request.headers.get('accept')).toBe('application/json');
			expect(request.headers.get('authorization')).toBe('Bearer sfmc-node-test-token');
			return Response.json({
				callbackId,
				callbackName: 'Node lifecycle callback',
				url: 'https://app.example.test/channels/salesforce-marketing-cloud/events',
				maxBatchSize: 250,
				status: 'verified',
				statusReason: 'none',
			});
		});
		const client = createSalesforceMarketingCloudClient({
			restBaseUrl: 'https://node-tenant.rest.marketingcloudapis.com/',
			accessToken: 'sfmc-node-test-token',
			fetcher,
		});

		const callback = await client.getCallback(callbackId);

		expect(callback).toEqual({
			callbackId,
			callbackName: 'Node lifecycle callback',
			url: 'https://app.example.test/channels/salesforce-marketing-cloud/events',
			maxBatchSize: 250,
			status: 'verified',
			statusReason: 'none',
		});
		expect(fetcher).toHaveBeenCalledOnce();
	});

	it('rejects non-tenant REST origins before issuing a request', () => {
		const rejected = [
			'http://tenant.rest.marketingcloudapis.com',
			'https://rest.marketingcloudapis.com',
			'https://tenant.rest.marketingcloudapis.com.attacker.example',
			'https://user:password@tenant.rest.marketingcloudapis.com',
			'https://tenant.rest.marketingcloudapis.com:8443',
			'https://tenant.rest.marketingcloudapis.com/platform',
			'https://tenant.rest.marketingcloudapis.com/?account=other',
			'https://tenant.rest.marketingcloudapis.com/#other',
		];

		for (const restBaseUrl of rejected) {
			expect(() => salesforceMarketingCloudRestOrigin(restBaseUrl)).toThrow(
				'REST base URL must be an HTTPS tenant origin',
			);
		}
	});

	it('derives a stable local email agent id from validated provider fields', () => {
		const event = {
			eventCategoryType: 'EngagementEvents.EmailOpen',
			timestampUTC: 1781399400123,
			mid: 510021,
			eid: '620031',
			raw: {
				eventCategoryType: 'EngagementEvents.EmailOpen',
				timestampUTC: 1781399400123,
				mid: 510021,
				eid: '620031',
				composite: {
					jobId: '730041',
					batchId: '12',
					listId: '440051',
					subscriberId: '880061',
				},
			},
		};

		const ref = emailRefFromEvent('6d9c31ce-b5b1-4d79-a56a-6f9e7f45bf58', event);
		expect(ref).toEqual({
			callbackId: '6d9c31ce-b5b1-4d79-a56a-6f9e7f45bf58',
			mid: '510021',
			eid: '620031',
			jobId: '730041',
			batchId: '12',
			listId: '440051',
			subscriberId: '880061',
		});
		if (!ref) throw new Error('Expected a valid synthetic email reference.');
		const id = emailEventInstanceId(ref);
		expect(emailEventInstanceId(ref)).toBe(id);
		expect(parseEmailEventInstanceId(id)).toEqual(ref);
		expect(
			emailEventInstanceId({
				subscriberId: ref.subscriberId,
				listId: ref.listId,
				batchId: ref.batchId,
				jobId: ref.jobId,
				eid: ref.eid,
				mid: ref.mid,
				callbackId: ref.callbackId,
				ignoredAtRuntime: 'not-part-of-identity',
			} as SalesforceMarketingCloudEmailRef),
		).toBe(id);
		expect(() =>
			parseEmailEventInstanceId(
				`salesforce-marketing-cloud-email:${encodeURIComponent(
					JSON.stringify({
						subscriberId: ref.subscriberId,
						listId: ref.listId,
						batchId: ref.batchId,
						jobId: ref.jobId,
						eid: ref.eid,
						mid: ref.mid,
						callbackId: ref.callbackId,
					}),
				)}`,
			),
		).toThrow('Expected a local Salesforce Marketing Cloud email agent id.');
	});
});
