import { describe, expect, it, vi } from 'vitest';
import { createCloudflareRunIndex, createCloudflareRunStore } from '../src/cloudflare/run-store.ts';
import { InMemoryRunStore } from '../src/node/run-store.ts';

function createNamespace(fetch: (request: Request) => Response | Promise<Response>) {
	const id = { toString: () => 'registry-id' };
	const instanceNames: string[] = [];
	const requestedIds: object[] = [];
	const requests: Request[] = [];
	return {
		id,
		instanceNames,
		namespace: {
			idFromName(name: string) {
				instanceNames.push(name);
				return id;
			},
			get(requestedId: object) {
				requestedIds.push(requestedId);
				return {
					async fetch(input: Request | string) {
						const request = typeof input === 'string' ? new Request(input) : input;
						requests.push(request);
						return fetch(request);
					},
				};
			},
		},
		requestedIds,
		requests,
	};
}

describe('createCloudflareRunStore()', () => {
	it('returns the record store unchanged when no registry namespace is bound', async () => {
		const records = new InMemoryRunStore();
		expect(createCloudflareRunStore(records, undefined)).toBe(records);
	});

	it('writes the record and mirrors a start pointer to the index DO when createRun() is called', async () => {
		const fake = createNamespace(() => new Response(null, { status: 204 }));
		const records = new InMemoryRunStore();
		const store = createCloudflareRunStore(records, fake.namespace);

		await store.createRun({
			runId: 'run_01DAILYREPORT',
			workflowName: 'daily-report',
			startedAt: '2026-06-01T10:00:00.000Z',
			input: { report: 'weekly' },
		});

		expect(await records.getRun('run_01DAILYREPORT')).toMatchObject({
			runId: 'run_01DAILYREPORT',
			status: 'active',
			input: { report: 'weekly' },
		});
		expect(fake.instanceNames).toEqual(['default']);
		expect(fake.requestedIds).toEqual([fake.id]);
		expect(fake.requests).toHaveLength(1);
		expect(fake.requests[0]?.url).toBe(
			'https://bapX-registry.local/pointers/run_01DAILYREPORT/start',
		);
		expect(fake.requests[0]?.method).toBe('POST');
		expect(fake.requests[0]?.headers.get('content-type')).toBe('application/json');
		expect(await fake.requests[0]?.json()).toEqual({
			workflowName: 'daily-report',
			startedAt: '2026-06-01T10:00:00.000Z',
		});
	});

	it('finalizes the record and mirrors a terminal pointer carrying the recorded start when endRun() is called', async () => {
		const fake = createNamespace(() => new Response(null, { status: 204 }));
		const records = new InMemoryRunStore();
		const store = createCloudflareRunStore(records, fake.namespace);

		await store.createRun({
			runId: 'run_01DAILYREPORT',
			workflowName: 'daily-report',
			startedAt: '2026-06-01T10:00:00.000Z',
			input: {},
		});
		await store.endRun({
			runId: 'run_01DAILYREPORT',
			endedAt: '2026-06-01T10:05:00.000Z',
			durationMs: 300_000,
			isError: true,
			error: { message: 'delivery failed' },
		});

		expect((await records.getRun('run_01DAILYREPORT'))?.status).toBe('errored');
		expect(fake.requests).toHaveLength(2);
		expect(fake.requests[1]?.url).toBe(
			'https://bapX-registry.local/pointers/run_01DAILYREPORT/end',
		);
		expect(fake.requests[1]?.method).toBe('POST');
		expect(await fake.requests[1]?.json()).toEqual({
			workflowName: 'daily-report',
			startedAt: '2026-06-01T10:00:00.000Z',
			endedAt: '2026-06-01T10:05:00.000Z',
			durationMs: 300_000,
			isError: true,
		});
	});

	it('skips the index pointer when endRun() targets an unknown run id', async () => {
		const fake = createNamespace(() => new Response(null, { status: 204 }));
		const store = createCloudflareRunStore(new InMemoryRunStore(), fake.namespace);

		await store.endRun({
			runId: 'run_01MISSING',
			endedAt: '2026-06-01T10:05:00.000Z',
			durationMs: 300_000,
			isError: false,
		});

		expect(fake.requests).toHaveLength(0);
	});

	it('still persists run lifecycle records when index DO writes fail', async () => {
		const fake = createNamespace(() => new Response('storage unavailable', { status: 503 }));
		const records = new InMemoryRunStore();
		const store = createCloudflareRunStore(records, fake.namespace);
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		try {
			await store.createRun({
				runId: 'run_01DAILYREPORT',
				workflowName: 'daily-report',
				startedAt: '2026-06-01T10:00:00.000Z',
				input: {},
			});
			await store.endRun({
				runId: 'run_01DAILYREPORT',
				endedAt: '2026-06-01T10:05:00.000Z',
				durationMs: 300_000,
				isError: false,
				result: { delivered: true },
			});

			expect(await records.getRun('run_01DAILYREPORT')).toMatchObject({
				status: 'completed',
				result: { delivered: true },
			});
			expect(consoleError).toHaveBeenCalledWith(
				'[bapX:run-index] recordRunStart failed:',
				expect.any(Error),
			);
			expect(consoleError).toHaveBeenCalledWith(
				'[bapX:run-index] recordRunEnd failed:',
				expect.any(Error),
			);
		} finally {
			consoleError.mockRestore();
		}
	});

	it('serves lookupRun() from the index DO and returns null on not-found responses', async () => {
		const fake = createNamespace(() => new Response('missing', { status: 404 }));
		const records = new InMemoryRunStore();
		await records.createRun({
			runId: 'run_01LOCAL',
			workflowName: 'daily-report',
			startedAt: '2026-06-01T10:00:00.000Z',
			input: {},
		});
		const store = createCloudflareRunStore(records, fake.namespace);

		expect(await store.lookupRun('run_01LOCAL')).toBeNull();
		expect(fake.requests).toHaveLength(1);
		expect(fake.requests[0]?.url).toBe('https://bapX-registry.local/pointers/run_01LOCAL');
		expect(fake.requests[0]?.method).toBe('GET');
	});

	it('URL-encodes run ids when index lookup and pointer requests are sent', async () => {
		const fake = createNamespace((request) => {
			if (request.method === 'GET') {
				return new Response(
					JSON.stringify({
						runId: 'run_01 colon:slash/id?#fragment',
						workflowName: 'daily report',
						status: 'active',
						startedAt: '2026-06-01T10:00:00.000Z',
					}),
					{ status: 200, headers: { 'content-type': 'application/json' } },
				);
			}
			return new Response(null, { status: 204 });
		});
		const store = createCloudflareRunStore(new InMemoryRunStore(), fake.namespace);

		await store.createRun({
			runId: 'run_01 colon:slash/id?#fragment',
			workflowName: 'daily report',
			startedAt: '2026-06-01T10:00:00.000Z',
			input: {},
		});
		await store.endRun({
			runId: 'run_01 colon:slash/id?#fragment',
			endedAt: '2026-06-01T10:05:00.000Z',
			durationMs: 300_000,
			isError: false,
		});
		expect(await store.lookupRun('run_01 colon:slash/id?#fragment')).toEqual({
			runId: 'run_01 colon:slash/id?#fragment',
			workflowName: 'daily report',
			status: 'active',
			startedAt: '2026-06-01T10:00:00.000Z',
		});

		expect(fake.requests.map((request) => request.url)).toEqual([
			'https://bapX-registry.local/pointers/run_01%20colon%3Aslash%2Fid%3F%23fragment/start',
			'https://bapX-registry.local/pointers/run_01%20colon%3Aslash%2Fid%3F%23fragment/end',
			'https://bapX-registry.local/pointers/run_01%20colon%3Aslash%2Fid%3F%23fragment',
		]);
		expect(fake.requests.map((request) => request.method)).toEqual(['POST', 'POST', 'GET']);
	});
});

describe('createCloudflareRunIndex()', () => {
	it('returns undefined when createCloudflareRunIndex() receives no namespace', () => {
		expect(createCloudflareRunIndex(undefined)).toBeUndefined();
	});

	it('forwards list filters when index listing is requested', async () => {
		const fake = createNamespace(
			() =>
				new Response(
					JSON.stringify({
						runs: [
							{
								runId: 'run_01DAILYREPORT',
								workflowName: 'daily report',
								status: 'errored',
								startedAt: '2026-06-01T10:00:00.000Z',
							},
						],
						nextCursor: 'next page/?',
					}),
					{ status: 200, headers: { 'content-type': 'application/json' } },
				),
		);
		const index = createCloudflareRunIndex(fake.namespace);

		expect(
			await index?.listRuns({
				status: 'errored',
				workflowName: 'daily report/summary',
				limit: 25,
				cursor: 'next page/?',
			}),
		).toEqual({
			runs: [
				{
					runId: 'run_01DAILYREPORT',
					workflowName: 'daily report',
					status: 'errored',
					startedAt: '2026-06-01T10:00:00.000Z',
				},
			],
			nextCursor: 'next page/?',
		});
		expect(fake.instanceNames).toEqual(['default']);
		expect(fake.requestedIds).toEqual([fake.id]);
		expect(fake.requests).toHaveLength(1);
		expect(fake.requests[0]?.url).toBe(
			'https://bapX-registry.local/pointers?status=errored&workflow=daily+report%2Fsummary&limit=25&cursor=next+page%2F%3F',
		);
		expect(fake.requests[0]?.method).toBe('GET');
	});

	it('throws a diagnostic error when the index DO responds unsuccessfully to a lookup', async () => {
		const fake = createNamespace(() => new Response('storage unavailable', { status: 503 }));
		const index = createCloudflareRunIndex(fake.namespace);

		await expect(index?.lookupRun('run_01DAILYREPORT')).rejects.toThrow(
			'[bapX] BapxRegistry lookupRun(run_01DAILYREPORT) failed: 503 storage unavailable',
		);
	});
});
