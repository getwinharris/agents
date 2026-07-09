/**
 * Shared RunStore contract coverage for the built-in backends:
 *
 *   - the in-memory store used by explicitly non-durable setups,
 *   - the SQL store behind the Node `sqlite()` persistence adapter,
 *   - the Cloudflare composite (per-workflow-DO records + BapxRegistry
 *     index DO), exercised through the real registry ops and router.
 *
 * The Postgres adapter runs the same suite from its own package.
 */
import { DatabaseSync } from 'node:sqlite';
import { createRegistryOps } from '../src/cloudflare/registry-ops.ts';
import { handleRegistryRequest } from '../src/cloudflare/registry-router.ts';
import { createCloudflareRunStore } from '../src/cloudflare/run-store.ts';
import { sqlite } from '../src/node/agent-execution-store.ts';
import { InMemoryRunStore } from '../src/node/run-store.ts';
import { createSqlRunStore } from '../src/sql-run-store.ts';
import type { SqlStorage } from '../src/sql-storage.ts';
import { defineRunStoreContractTests } from '../src/test-utils/define-run-store-contract-tests.ts';

function createNodeSqlStorage(): SqlStorage {
	const db = new DatabaseSync(':memory:');
	return {
		exec(query: string, ...bindings: unknown[]) {
			const stmt = db.prepare(query);
			const trimmed = query.trimStart().toUpperCase();
			const expectsRows =
				trimmed.startsWith('SELECT') || trimmed.startsWith('WITH') || /\bRETURNING\b/i.test(query);
			let rows: Record<string, unknown>[];
			if (expectsRows) {
				rows = stmt.all(...(bindings as never[])) as Record<string, unknown>[];
			} else {
				stmt.run(...(bindings as never[]));
				rows = [];
			}
			return {
				toArray() {
					return rows;
				},
			};
		},
	};
}

defineRunStoreContractTests('InMemoryRunStore', {
	create() {
		return new InMemoryRunStore();
	},
});

{
	let adapter: ReturnType<typeof sqlite> | undefined;
	defineRunStoreContractTests('sqlite() RunStore', {
		async create() {
			adapter = sqlite();
			await adapter.migrate?.();
			const { runStore } = await adapter.connect();
			return runStore;
		},
		async cleanup() {
			await adapter?.close?.();
			adapter = undefined;
		},
	});
}

defineRunStoreContractTests('Cloudflare composite RunStore', {
	create() {
		// Per-workflow-DO record storage and the singleton index DO each get
		// their own SQLite database, mirroring the deployed topology. The
		// namespace fake routes index traffic through the real registry router.
		const records = createSqlRunStore(createNodeSqlStorage());
		const ops = createRegistryOps(createNodeSqlStorage());
		const namespace = {
			idFromName: (name: string) => ({ name }),
			get: () => ({
				fetch: (request: Request) => handleRegistryRequest(ops, request),
			}),
		};
		return createCloudflareRunStore(records, namespace);
	},
});
