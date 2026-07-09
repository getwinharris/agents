/**
 * Composite `RunStore` for the Cloudflare target.
 *
 * Cloudflare keeps run records in per-workflow Durable Objects and a pointer
 * index in the singleton `BapxRegistry` DO. This module hides that topology
 * behind the single public `RunStore` contract:
 *
 *   - `createRun`/`endRun` write the authoritative per-DO record, then
 *     mirror a pointer into the index DO (best-effort — an index fault must
 *     not fail run admission or finalization).
 *   - `getRun` reads the per-DO record.
 *   - `lookupRun`/`listRuns` query the cross-deployment index DO.
 *
 * The generated worker entry wires this via the build plugin; none of it is
 * part of the public adapter contract.
 */
import type {
	CreateRunInput,
	EndRunInput,
	ListRunsOpts,
	ListRunsResponse,
	RunRecord,
	RunStore,
	WorkflowRunPointer,
} from '../runtime/run-store.ts';
import type { RecordRunEndInput, RecordRunStartInput } from './registry-ops.ts';

interface BapxRegistryNamespace {
	idFromName(name: string): object;
	get(id: object): { fetch(input: Request): Promise<Response> };
}

/** Cross-deployment run lookup/listing surface of the index DO. */
export type CloudflareRunIndex = Pick<RunStore, 'lookupRun' | 'listRuns'>;

/**
 * Request-scoped client for the `BapxRegistry` index DO, used by the outer
 * worker for `/runs/:runId` lookups and `listRuns()`.
 */
export function createCloudflareRunIndex(
	namespace: BapxRegistryNamespace | undefined,
): CloudflareRunIndex | undefined {
	if (!namespace) return undefined;
	return new BapxRegistryClient(namespace);
}

/**
 * Compose the per-workflow-DO record store with the `BapxRegistry` index DO.
 * Without a registry binding the record store is used as-is (no
 * cross-deployment index).
 */
export function createCloudflareRunStore(
	records: RunStore,
	namespace: BapxRegistryNamespace | undefined,
): RunStore {
	if (!namespace) return records;
	return new CloudflareCompositeRunStore(records, new BapxRegistryClient(namespace));
}

class CloudflareCompositeRunStore implements RunStore {
	constructor(
		private records: RunStore,
		private index: BapxRegistryClient,
	) {}

	async createRun(input: CreateRunInput): Promise<void> {
		await this.records.createRun(input);
		await safeIndexWrite('recordRunStart', () =>
			this.index.recordRunStart({
				runId: input.runId,
				workflowName: input.workflowName,
				startedAt: input.startedAt,
			}),
		);
	}

	async endRun(input: EndRunInput): Promise<void> {
		await this.records.endRun(input);
		// The index pointer upsert needs workflowName/startedAt; read them from
		// the authoritative record (same-DO SQLite, cheap). When the record is
		// missing, endRun was a no-op — leave the index untouched too.
		const record = await this.records.getRun(input.runId);
		if (!record) return;
		await safeIndexWrite('recordRunEnd', () =>
			this.index.recordRunEnd({
				runId: input.runId,
				workflowName: record.workflowName,
				startedAt: record.startedAt,
				endedAt: input.endedAt,
				durationMs: input.durationMs,
				isError: input.isError,
			}),
		);
	}

	async getRun(runId: string): Promise<RunRecord | null> {
		return this.records.getRun(runId);
	}

	async lookupRun(runId: string): Promise<WorkflowRunPointer | null> {
		return this.index.lookupRun(runId);
	}

	async listRuns(opts: ListRunsOpts = {}): Promise<ListRunsResponse> {
		return this.index.listRuns(opts);
	}
}

/**
 * The index is a mirror of authoritative per-DO records: a faulted pointer
 * write must not fail run admission or finalization.
 */
async function safeIndexWrite(label: string, fn: () => Promise<void>): Promise<void> {
	try {
		await fn();
	} catch (error) {
		console.error(`[bapX:run-index] ${label} failed:`, error);
	}
}

const FLUE_REGISTRY_INSTANCE_NAME = 'default';
const SYNTHETIC_BASE = 'https://bapX-registry.local';

class BapxRegistryClient implements CloudflareRunIndex {
	constructor(private namespace: BapxRegistryNamespace) {}

	async recordRunStart(input: RecordRunStartInput): Promise<void> {
		const { runId, ...body } = input;
		await this.callExpectingNoContent(`/pointers/${encodeURIComponent(runId)}/start`, 'POST', body);
	}

	async recordRunEnd(input: RecordRunEndInput): Promise<void> {
		const { runId, ...body } = input;
		await this.callExpectingNoContent(`/pointers/${encodeURIComponent(runId)}/end`, 'POST', body);
	}

	async lookupRun(runId: string): Promise<WorkflowRunPointer | null> {
		const response = await this.fetch(
			new Request(`${SYNTHETIC_BASE}/pointers/${encodeURIComponent(runId)}`, { method: 'GET' }),
		);
		if (response.status === 404) return null;
		if (!response.ok) {
			throw new Error(
				`[bapX] BapxRegistry lookupRun(${runId}) failed: ${response.status} ${await response.text()}`,
			);
		}
		return (await response.json()) as WorkflowRunPointer;
	}

	async listRuns(opts: ListRunsOpts = {}): Promise<ListRunsResponse> {
		const params = new URLSearchParams();
		if (opts.status) params.set('status', opts.status);
		if (opts.workflowName) params.set('workflow', opts.workflowName);
		if (opts.limit !== undefined) params.set('limit', String(opts.limit));
		if (opts.cursor) params.set('cursor', opts.cursor);
		const qs = params.toString();
		const response = await this.fetch(
			new Request(`${SYNTHETIC_BASE}/pointers${qs ? `?${qs}` : ''}`, { method: 'GET' }),
		);
		if (!response.ok) {
			throw new Error(
				`[bapX] BapxRegistry listRuns failed: ${response.status} ${await response.text()}`,
			);
		}
		return (await response.json()) as ListRunsResponse;
	}

	private fetch(request: Request): Promise<Response> {
		return this.namespace
			.get(this.namespace.idFromName(FLUE_REGISTRY_INSTANCE_NAME))
			.fetch(request);
	}

	private async callExpectingNoContent(
		path: string,
		method: 'POST' | 'GET',
		body: unknown,
	): Promise<void> {
		const response = await this.fetch(
			new Request(`${SYNTHETIC_BASE}${path}`, {
				method,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body),
			}),
		);
		if (!response.ok) {
			throw new Error(
				`[bapX] BapxRegistry ${method} ${path} failed: ${response.status} ${await response.text()}`,
			);
		}
	}
}
