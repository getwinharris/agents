/** Private REST router exposing {@link RegistryOps} over the `BapxRegistry` Durable Object. */
import type { ListRunsOpts } from '../runtime/run-store.ts';
import type { RecordRunEndInput, RecordRunStartInput, RegistryOps } from './registry-ops.ts';

export async function handleRegistryRequest(ops: RegistryOps, request: Request): Promise<Response> {
	const url = new URL(request.url);
	const segments = url.pathname.split('/').filter(Boolean);
	try {
		if (request.method === 'GET' && segments[0] === 'pointers' && segments.length === 2) {
			const runId = decodeURIComponent(segments[1] ?? '');
			if (!runId) return new Response('Missing runId.', { status: 404 });
			const pointer = ops.lookupRun(runId);
			if (!pointer) return new Response(null, { status: 404 });
			return jsonResponse(pointer);
		}
		if (
			request.method === 'POST' &&
			segments[0] === 'pointers' &&
			segments[2] === 'start' &&
			segments.length === 3
		) {
			const runId = decodeURIComponent(segments[1] ?? '');
			if (!runId) return new Response('Missing runId.', { status: 404 });
			const body = (await request.json()) as Omit<RecordRunStartInput, 'runId'>;
			ops.recordRunStart({ ...body, runId });
			return new Response(null, { status: 204 });
		}
		if (
			request.method === 'POST' &&
			segments[0] === 'pointers' &&
			segments[2] === 'end' &&
			segments.length === 3
		) {
			const runId = decodeURIComponent(segments[1] ?? '');
			if (!runId) return new Response('Missing runId.', { status: 404 });
			const body = (await request.json()) as Omit<RecordRunEndInput, 'runId'>;
			ops.recordRunEnd({ ...body, runId });
			return new Response(null, { status: 204 });
		}
		if (request.method === 'GET' && segments[0] === 'pointers' && segments.length === 1) {
			return jsonResponse(ops.listRuns(parseListRunsOpts(url.searchParams)));
		}
		return new Response(`Unknown registry endpoint: ${request.method} ${url.pathname}`, {
			status: 404,
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return new Response(JSON.stringify({ error: message }), {
			status: 500,
			headers: jsonHeaders(),
		});
	}
}

function parseListRunsOpts(params: URLSearchParams): ListRunsOpts {
	const opts: ListRunsOpts = {};
	const status = params.get('status');
	if (status === 'active' || status === 'completed' || status === 'errored') opts.status = status;
	const workflow = params.get('workflow');
	if (workflow) opts.workflowName = workflow;
	const limit = params.get('limit');
	if (limit !== null) opts.limit = Number.parseInt(limit, 10);
	const cursor = params.get('cursor');
	if (cursor) opts.cursor = cursor;
	return opts;
}

function jsonHeaders(): Record<string, string> {
	return { 'content-type': 'application/json' };
}

function jsonResponse(body: unknown): Response {
	return new Response(JSON.stringify(body), { headers: jsonHeaders() });
}
