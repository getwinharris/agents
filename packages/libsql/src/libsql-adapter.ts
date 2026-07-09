/**
 * libSQL / Turso persistence adapter.
 *
 * Implements {@link AgentSubmissionStore}, {@link RunStore}, and
 * {@link EventStreamStore} against a libSQL / Turso database using
 * SQLite-dialect parameterised queries (`?` placeholders).
 *
 * The adapter accepts any async SQL runner conforming to {@link LibsqlRunner}
 * so that an application can supply its own configured `@libsql/client`, and
 * tests can substitute an in-memory client without pulling in a real server.
 */

import type { WorkflowRunPointer } from '@bapX/runtime';
import type {
	AgentAttemptMarker,
	AgentDispatchAdmission,
	AgentSubmission,
	AgentSubmissionStore,
	CreateRunInput,
	AgentSubmissionInput,
	DispatchInput,
	EndRunInput,
	EventStreamMeta,
	EventStreamReadResult,
	EventStreamStore,
	ListRunsOpts,
	ListRunsResponse,
	PersistedChunkOwner,
	PersistedChunkRow,
	PersistedChunkStore,
	PersistenceAdapter,
	RunPointer,
	RunRecord,
	RunStatus,
	RunStore,
	SubmissionAttemptRef,
	SubmissionClaimRef,
} from '@bapX/runtime/adapter';
import {
	admitSubmissionWithBackend,
	assertSupportedBapxSchemaVersion,
	clampLimit,
	createDispatchAgentSubmissionInput,
	DEFAULT_LIST_LIMIT,
	DEFAULT_READ_LIMIT,
	DURABILITY_DEFAULT_MAX_ATTEMPTS,
	DURABILITY_DEFAULT_TIMEOUT_MS,
	decodeRunCursor,
	encodeRunCursor,
	FLUE_SCHEMA_VERSION,
	formatOffset,
	hydratePersistedSubmissionAttachments,
	isSubmissionPayload,
	LEASE_DURATION_MS,
	MAX_LIST_LIMIT,
	MAX_READ_LIMIT,
	parseOffset,
	submissionChunkOwner,
} from '@bapX/runtime/adapter';
import { LibsqlAttachmentStore } from './libsql-attachment-store.ts';
import { createLibsqlConversationStreamStore } from './libsql-conversation-store.ts';

// ─── Bring-your-own-driver runner seam ──────────────────────────────────────

/** A single row returned from a query. */
type SqlRow = Record<string, unknown>;

/**
 * A query over a configured libSQL driver: a SQL string with `?` placeholders
 * plus positional parameters, resolving to result rows as plain objects.
 */
export type LibsqlParameter = string | number | boolean | ArrayBuffer | null;
export type LibsqlQuery = (text: string, params?: LibsqlParameter[]) => Promise<SqlRow[]>;

/**
 * The driver seam `@bapX/libsql` runs against. Wrap your own configured
 * `@libsql/client` (local file, in-memory, or a Turso embedded/remote URL) in
 * this shape — `@bapX/libsql` does not pick or bundle a driver, so you own
 * driver choice, sync settings, auth tokens, and every other connection option.
 *
 * `transaction` must run `fn` inside one transaction on a single connection,
 * committing on resolve and rolling back on throw. The `tx` passed to `fn`
 * only needs `query`; the adapter never nests transactions.
 */
export interface LibsqlRunner {
	query: LibsqlQuery;
	transaction<T>(fn: (tx: { query: LibsqlQuery }) => Promise<T>): Promise<T>;
	close(): void | Promise<void>;
}

// ─── Public factory ─────────────────────────────────────────────────────────

/**
 * Create a libSQL-backed {@link PersistenceAdapter} from a {@link LibsqlRunner}.
 *
 * `@bapX/libsql` does not pick or bundle a driver — wrap your own configured
 * `@libsql/client` in the runner shape so you own driver choice and every
 * connection option.
 *
 * @example
 * ```ts
 * import { libsql } from '@bapX/libsql';
 * import { createClient } from '@libsql/client';
 *
 * const client = createClient({
 *   url: process.env.LIBSQL_URL!,
 *   authToken: process.env.LIBSQL_AUTH_TOKEN,
 * });
 *
 * const toRows = (rs: { rows: ArrayLike<Record<string, unknown>>; columns: string[] }) =>
 *   Array.from(rs.rows, (row) =>
 *     Object.fromEntries(rs.columns.map((column) => [column, row[column]])));
 *
 * let tail: Promise<unknown> = Promise.resolve();
 * const serialize = <T>(operation: () => Promise<T>): Promise<T> => {
 *   const result = tail.then(operation, operation);
 *   tail = result.then(() => undefined, () => undefined);
 *   return result;
 * };
 *
 * export default libsql({
 *   query: (text, params = []) =>
 *     serialize(async () => toRows(await client.execute({ sql: text, args: params }))),
 *   transaction: (fn) => serialize(async () => {
 *     const tx = await client.transaction('write');
 *     try {
 *       const result = await fn({
 *         query: async (text, params = []) =>
 *           toRows(await tx.execute({ sql: text, args: params })),
 *       });
 *       await tx.commit();
 *       return result;
 *     } catch (error) {
 *       await tx.rollback();
 *       throw error;
 *     } finally {
 *       tx.close();
 *     }
 *   }),
 *   close: () => client.close(),
 * });
 * ```
 */
export function libsql(runner: LibsqlRunner): PersistenceAdapter {
	let closed = false;
	return {
		async migrate() {
			await ensureTables(runner);
		},
		connect() {
			return {
				executionStore: {
					submissions: new LibsqlSubmissionStore(runner),
				},
				runStore: new LibsqlRunStore(runner),
				eventStreamStore: new LibsqlEventStreamStore(runner),
				conversationStreamStore: createLibsqlConversationStreamStore(runner),
				attachmentStore: new LibsqlAttachmentStore(runner),
			};
		},
		async close() {
			if (closed) return;
			closed = true;
			await runner.close();
		},
	};
}

// ─── Schema ─────────────────────────────────────────────────────────────────

async function ensureTables(runner: LibsqlRunner): Promise<void> {
	// Wrap all schema setup in a single transaction so partial failures don't
	// leave the database half-migrated.
	await runner.transaction(async (tx) => {
		// Stamp a fresh database with the current schema version; refuse to
		// touch a database recorded with an unknown or newer version.
		await tx.query(`
			CREATE TABLE IF NOT EXISTS bapX_meta (
				key TEXT PRIMARY KEY,
				value TEXT NOT NULL
			)
		`);
		const versionRows = await tx.query(`SELECT value FROM bapX_meta WHERE key = 'schema_version'`);
		const storedVersion = versionRows[0]?.value;
		if (storedVersion === undefined || storedVersion === null) {
			const existing = await tx.query(
				`SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'bapX_%' AND name <> 'bapX_meta' LIMIT 1`,
			);
			if (existing.length > 0) assertSupportedBapxSchemaVersion('unversioned');
			await tx.query(`INSERT OR IGNORE INTO bapX_meta (key, value) VALUES ('schema_version', ?)`, [
				String(FLUE_SCHEMA_VERSION),
			]);
		} else {
			assertSupportedBapxSchemaVersion(String(storedVersion));
		}

		await tx.query(`
			CREATE TABLE IF NOT EXISTS bapX_image_chunks (
				owner_kind TEXT NOT NULL,
				owner_id TEXT NOT NULL,
				owner_part TEXT NOT NULL,
				image_id TEXT NOT NULL,
				chunk_index INTEGER NOT NULL,
				chunk_count INTEGER NOT NULL,
				data TEXT NOT NULL,
				PRIMARY KEY (owner_kind, owner_id, owner_part, image_id, chunk_index)
			)
		`);

		await tx.query(`
			CREATE TABLE IF NOT EXISTS bapX_agent_submissions (
				sequence INTEGER PRIMARY KEY AUTOINCREMENT,
				submission_id TEXT NOT NULL UNIQUE,
				session_key TEXT NOT NULL,
				kind TEXT NOT NULL,
				payload TEXT NOT NULL,
				status TEXT NOT NULL,
				accepted_at INTEGER NOT NULL,
				canonical_ready_at INTEGER,
				attempt_id TEXT,
				input_applied_at INTEGER,
				recovery_requested_at INTEGER,
				abort_requested_at INTEGER,
				started_at INTEGER,
				settled_at INTEGER,
				error TEXT,
				attempt_count INTEGER NOT NULL DEFAULT 0,
				max_retry INTEGER NOT NULL DEFAULT ${DURABILITY_DEFAULT_MAX_ATTEMPTS},
				timeout_at INTEGER NOT NULL DEFAULT 0,
				owner_id TEXT,
				lease_expires_at INTEGER NOT NULL DEFAULT 0,
				settlement_record_id TEXT,
				settlement_record TEXT
			)
		`);


		await tx.query(`
			CREATE TABLE IF NOT EXISTS bapX_agent_dispatch_receipts (
				dispatch_id TEXT PRIMARY KEY,
				accepted_at INTEGER NOT NULL
			)
		`);

		await tx.query(`
			CREATE TABLE IF NOT EXISTS bapX_agent_attempt_markers (
				submission_id TEXT NOT NULL,
				attempt_id TEXT NOT NULL,
				created_at INTEGER NOT NULL,
				PRIMARY KEY (submission_id, attempt_id)
			)
		`);

		await tx.query(`
			CREATE INDEX IF NOT EXISTS bapX_agent_submissions_status_sequence_idx
			ON bapX_agent_submissions (status, sequence ASC)
		`);

		await tx.query(`
			CREATE INDEX IF NOT EXISTS bapX_agent_submissions_session_status_sequence_idx
			ON bapX_agent_submissions (session_key, status, sequence ASC)
		`);

		await tx.query(`
			CREATE TABLE IF NOT EXISTS bapX_runs (
				run_id TEXT PRIMARY KEY,
				workflow_name TEXT NOT NULL,
				status TEXT NOT NULL,
				started_at TEXT NOT NULL,
				payload TEXT,
				traceparent TEXT,
				tracestate TEXT,
				ended_at TEXT,
				is_error INTEGER,
				duration_ms INTEGER,
				result TEXT,
				error TEXT
			)
		`);
		for (const statement of [
			`ALTER TABLE bapX_runs ADD COLUMN traceparent TEXT`,
			`ALTER TABLE bapX_runs ADD COLUMN tracestate TEXT`,
		]) {
			try {
				await tx.query(statement);
			} catch (error) {
				if (!String(error).toLowerCase().includes('duplicate column')) throw error;
			}
		}

		await tx.query(`
			CREATE INDEX IF NOT EXISTS bapX_runs_status_started_idx
			ON bapX_runs (status, started_at DESC, run_id DESC)
		`);

		await tx.query(`
			CREATE INDEX IF NOT EXISTS bapX_runs_workflow_started_idx
			ON bapX_runs (workflow_name, started_at DESC, run_id DESC)
		`);

		await tx.query(`
			CREATE TABLE IF NOT EXISTS bapX_event_streams (
				path         TEXT PRIMARY KEY,
				next_offset  INTEGER NOT NULL DEFAULT 0,
				closed       INTEGER NOT NULL DEFAULT 0
			)
		`);

		await tx.query(`
			CREATE TABLE IF NOT EXISTS bapX_event_stream_entries (
				path    TEXT NOT NULL,
				seq     INTEGER NOT NULL,
				data    TEXT NOT NULL,
				PRIMARY KEY (path, seq)
			)
		`);
		await tx.query(`
			CREATE TABLE IF NOT EXISTS bapX_conversation_streams (
				path TEXT PRIMARY KEY,
				identity_json TEXT NOT NULL,
				next_offset INTEGER NOT NULL DEFAULT 0,
				producer_id TEXT,
				producer_epoch INTEGER NOT NULL DEFAULT 0,
				next_producer_sequence INTEGER NOT NULL DEFAULT 0,
				incarnation TEXT NOT NULL
			)
		`);
		await tx.query(`
			CREATE TABLE IF NOT EXISTS bapX_conversation_stream_batches (
				path TEXT NOT NULL,
				seq INTEGER NOT NULL,
				producer_id TEXT NOT NULL,
				producer_epoch INTEGER NOT NULL,
				producer_sequence INTEGER NOT NULL,
				data TEXT NOT NULL,
				submission_id TEXT,
				attempt_id TEXT,
				PRIMARY KEY (path, seq),
				UNIQUE (path, producer_id, producer_epoch, producer_sequence)
			)
		`);
		await tx.query(`
			CREATE TABLE IF NOT EXISTS bapX_attachments (
				stream_path TEXT NOT NULL,
				attachment_id TEXT NOT NULL,
				mime_type TEXT NOT NULL,
				byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
				digest TEXT NOT NULL,
				conversation_id TEXT NOT NULL,
				bytes BLOB NOT NULL,
				created_at INTEGER NOT NULL,
				PRIMARY KEY (stream_path, attachment_id)
			)
		`);
		await tx.query(`
			CREATE INDEX IF NOT EXISTS bapX_attachments_conversation_idx
			ON bapX_attachments (stream_path, conversation_id, attachment_id)
		`);
		try {
			await tx.query(`ALTER TABLE bapX_event_stream_entries ADD COLUMN event_key TEXT`);
		} catch (error) {
			if (!String(error).toLowerCase().includes('duplicate column')) throw error;
		}
		await tx.query(`
			CREATE UNIQUE INDEX IF NOT EXISTS bapX_event_stream_entries_path_event_key_idx
			ON bapX_event_stream_entries (path, event_key)
			WHERE event_key IS NOT NULL
		`);
	});
}

// ─── Session store ──────────────────────────────────────────────────────────

interface LibsqlQueryRunner {
	query: LibsqlQuery;
}

function createLibsqlChunkStore(runner: LibsqlQueryRunner): PersistedChunkStore<Promise<void>> {
	return {
		async read(owner) {
			const rows = await runner.query(
				`SELECT image_id, chunk_index, chunk_count, data
				 FROM bapX_image_chunks
				 WHERE owner_kind = ? AND owner_id = ? AND owner_part = ?
				 ORDER BY image_id, chunk_index`,
				[owner.kind, owner.id, owner.part],
			);
			return rows.map(parsePersistedChunkRow);
		},
		async replace(owner, chunks) {
			await deleteLibsqlChunkOwner(runner, owner);
			for (const chunk of chunks) {
				await runner.query(
					`INSERT INTO bapX_image_chunks
					 (owner_kind, owner_id, owner_part, image_id, chunk_index, chunk_count, data)
					 VALUES (?, ?, ?, ?, ?, ?, ?)`,
					[owner.kind, owner.id, owner.part, chunk.imageId, chunk.index, chunk.count, chunk.data],
				);
			}
		},
		async delete(owner) {
			await deleteLibsqlChunkOwner(runner, owner);
		},
		async deleteMany(owners) {
			for (const owner of owners) await deleteLibsqlChunkOwner(runner, owner);
		},
		async deleteOwner(kind, id) {
			await runner.query('DELETE FROM bapX_image_chunks WHERE owner_kind = ? AND owner_id = ?', [
				kind,
				id,
			]);
		},
	};
}

function parsePersistedChunkRow(row: SqlRow): PersistedChunkRow {
	const index = Number(row.chunk_index);
	const count = Number(row.chunk_count);
	if (
		typeof row.image_id !== 'string' ||
		!Number.isInteger(index) ||
		!Number.isInteger(count) ||
		typeof row.data !== 'string'
	) {
		throw new Error('[bapX] Persisted image chunk row is malformed.');
	}
	return { imageId: row.image_id, index, count, data: row.data };
}

async function deleteLibsqlChunkOwner(
	runner: LibsqlQueryRunner,
	owner: PersistedChunkOwner,
): Promise<void> {
	await runner.query(
		'DELETE FROM bapX_image_chunks WHERE owner_kind = ? AND owner_id = ? AND owner_part = ?',
		[owner.kind, owner.id, owner.part],
	);
}


// ─── Submission store ───────────────────────────────────────────────────────

const submissionColumns = [
	'sequence',
	'submission_id',
	'session_key',
	'kind',
	'payload',
	'status',
	'accepted_at',
	'canonical_ready_at',
	'attempt_id',
	'input_applied_at',
	'recovery_requested_at',
	'abort_requested_at',
	'started_at',
	'error',
	'attempt_count',
	'max_retry',
	'timeout_at',
	'owner_id',
	'lease_expires_at',
].join(', ');

function prefixed(table: string): string {
	return submissionColumns
		.split(', ')
		.map((c) => `${table}.${c}`)
		.join(', ');
}

class LibsqlSubmissionStore implements AgentSubmissionStore {
	constructor(private runner: LibsqlRunner) {}

	// ── Query ────────────────────────────────────────────────────────────

	async getSubmission(submissionId: string): Promise<AgentSubmission | null> {
		return this.runner.transaction(async (tx) => {
			const rows = await tx.query(
				`SELECT ${submissionColumns} FROM bapX_agent_submissions WHERE submission_id = ? LIMIT 1`,
				[submissionId],
			);
			return rows[0]
				? parseSubmission(
						rows[0],
						await createLibsqlChunkStore(tx).read(submissionChunkOwner(submissionId)),
					)
				: null;
		});
	}

	async markSubmissionCanonicalReady(submissionId: string): Promise<AgentSubmission | null> {
		const rows = await this.runner.query(
			`UPDATE bapX_agent_submissions SET canonical_ready_at = COALESCE(canonical_ready_at, ?)
			 WHERE submission_id = ? AND status = 'queued' RETURNING ${submissionColumns}`,
			[Date.now(), submissionId],
		);
		return rows[0] ? this.getSubmission(submissionId) : null;
	}

	async hasUnsettledSubmissions(): Promise<boolean> {
		const rows = await this.runner.query(
			`SELECT 1 FROM bapX_agent_submissions WHERE status IN ('queued', 'running', 'terminalizing') LIMIT 1`,
		);
		return rows.length > 0;
	}

	async listUnreadySubmissions(): Promise<AgentSubmission[]> {
		return this.runner.transaction(async (tx) => {
			const rows = await tx.query(
				`SELECT ${submissionColumns}
				 FROM bapX_agent_submissions
				 WHERE status = 'queued' AND canonical_ready_at IS NULL
				 ORDER BY sequence ASC`,
			);
			return this.parseOperationalRows(rows, 'queued', tx);
		});
	}

	async listRunnableSubmissions(): Promise<AgentSubmission[]> {
		return this.runner.transaction(async (tx) => {
			const rows = await tx.query(
				`SELECT ${prefixed('current_sub')}
			 FROM bapX_agent_submissions AS current_sub
			 WHERE current_sub.status = 'queued'
			   AND current_sub.canonical_ready_at IS NOT NULL
			   AND NOT EXISTS (
			     SELECT 1
			     FROM bapX_agent_submissions AS earlier
			     WHERE earlier.session_key = current_sub.session_key
			       AND earlier.status IN ('queued', 'running', 'terminalizing')
			       AND earlier.sequence < current_sub.sequence
			   )
			 ORDER BY current_sub.sequence ASC`,
			);
			return this.parseOperationalRows(rows, 'queued', tx);
		});
	}

	async listRunningSubmissions(): Promise<AgentSubmission[]> {
		return this.runner.transaction(async (tx) => {
			const rows = await tx.query(
				`SELECT ${submissionColumns}
			 FROM bapX_agent_submissions
			 WHERE status = 'running'
			 ORDER BY sequence ASC`,
			);
			return this.parseOperationalRows(rows, 'active', tx);
		});
	}

	async replaceSubmissionAttempt(
		attempt: SubmissionAttemptRef,
		nextAttemptId: string,
		lease?: { ownerId: string; leaseExpiresAt: number },
	): Promise<AgentSubmission | null> {
		return this.runner.transaction(async (tx) => {
			const now = Date.now();
			const subRows = lease
				? await tx.query(
						`UPDATE bapX_agent_submissions
					 SET attempt_id = ?, recovery_requested_at = NULL, started_at = ?, attempt_count = attempt_count + 1,
					     owner_id = ?, lease_expires_at = ?
					 WHERE submission_id = ? AND status = 'running' AND attempt_id = ?
					 RETURNING ${submissionColumns}`,
						[
							nextAttemptId,
							now,
							lease.ownerId,
							lease.leaseExpiresAt,
							attempt.submissionId,
							attempt.attemptId,
						],
					)
				: await tx.query(
						`UPDATE bapX_agent_submissions
					 SET attempt_id = ?, recovery_requested_at = NULL, started_at = ?, attempt_count = attempt_count + 1
					 WHERE submission_id = ? AND status = 'running' AND attempt_id = ?
					 RETURNING ${submissionColumns}`,
						[nextAttemptId, now, attempt.submissionId, attempt.attemptId],
					);
			if (!subRows[0]) return null;
			return parseSubmission(
				subRows[0],
				await createLibsqlChunkStore(tx).read(submissionChunkOwner(attempt.submissionId)),
			);
		});
	}

	// ── Admission ────────────────────────────────────────────────────────

	async admitDispatch(input: DispatchInput): Promise<AgentDispatchAdmission> {
		return this.admitSubmission(createDispatchAgentSubmissionInput(input));
	}

	async admitDirect(input: AgentSubmissionInput): Promise<AgentSubmission> {
		const admission = await this.admitSubmission(input);
		if (admission.kind !== 'submission') {
			throw new Error('[bapX] Internal direct admission returned an unexpected result.');
		}
		return admission.submission;
	}

	// ── Submission lifecycle ─────────────────────────────────────────────

	async claimSubmission(claim: SubmissionClaimRef): Promise<AgentSubmission | null> {
		const now = Date.now();
		const timeoutAt = now + DURABILITY_DEFAULT_TIMEOUT_MS;

		// SQLite supports `UPDATE ... AS alias` with a self-referencing
		// NOT EXISTS subquery, so the claim is a single statement.
		return this.runner.transaction(async (tx) => {
			const rows = await tx.query(
				`UPDATE bapX_agent_submissions AS current
			 SET status = 'running', attempt_id = ?, started_at = ?, attempt_count = attempt_count + 1,
			     max_retry = ?, timeout_at = CASE WHEN timeout_at = 0 THEN ? ELSE timeout_at END,
			     owner_id = ?, lease_expires_at = ?
			 WHERE current.submission_id = ? AND current.status = 'queued'
			   AND current.canonical_ready_at IS NOT NULL
			   AND NOT EXISTS (
			     SELECT 1
			     FROM bapX_agent_submissions AS earlier
			     WHERE earlier.session_key = current.session_key
			       AND earlier.status IN ('queued', 'running', 'terminalizing')
			       AND earlier.sequence < current.sequence
			   )
			 RETURNING ${submissionColumns}`,
				[
					claim.attemptId,
					now,
					DURABILITY_DEFAULT_MAX_ATTEMPTS,
					timeoutAt,
					claim.ownerId,
					claim.leaseExpiresAt,
					claim.submissionId,
				],
			);
			return rows[0]
				? parseSubmission(
						rows[0],
						await createLibsqlChunkStore(tx).read(submissionChunkOwner(claim.submissionId)),
					)
				: null;
		});
	}

	async markSubmissionInputApplied(
		attempt: SubmissionAttemptRef,
		durability?: { maxRetry: number; timeoutAt: number },
	): Promise<boolean> {
		const now = Date.now();
		const rows = await this.runner.query(
			`UPDATE bapX_agent_submissions
			 SET input_applied_at = COALESCE(input_applied_at, ?),
			     max_retry = CASE WHEN input_applied_at IS NULL THEN ? ELSE max_retry END,
			     timeout_at = CASE WHEN input_applied_at IS NULL THEN ? ELSE timeout_at END
			 WHERE submission_id = ? AND status = 'running' AND attempt_id = ?
			 RETURNING submission_id`,
			[
				now,
				durability?.maxRetry ?? DURABILITY_DEFAULT_MAX_ATTEMPTS,
				durability?.timeoutAt ?? now + DURABILITY_DEFAULT_TIMEOUT_MS,
				attempt.submissionId,
				attempt.attemptId,
			],
		);
		return rows.length > 0;
	}

	async requestSubmissionRecovery(attempt: SubmissionAttemptRef): Promise<boolean> {
		const rows = await this.runner.query(
			`UPDATE bapX_agent_submissions
			 SET recovery_requested_at = COALESCE(recovery_requested_at, ?)
			 WHERE submission_id = ? AND status = 'running' AND attempt_id = ?
			 RETURNING submission_id`,
			[Date.now(), attempt.submissionId, attempt.attemptId],
		);
		return rows.length > 0;
	}

	async requestSessionAbort(sessionKey: string): Promise<string[]> {
		const rows = await this.runner.query(
			`UPDATE bapX_agent_submissions
			 SET abort_requested_at = COALESCE(abort_requested_at, ?)
			 WHERE session_key = ? AND status IN ('queued', 'running')
			 RETURNING submission_id`,
			[Date.now(), sessionKey],
		);
		return rows.map((row) => String(row.submission_id));
	}

	async requeueSubmissionBeforeInputApplied(attempt: SubmissionAttemptRef): Promise<boolean> {
		const rows = await this.runner.query(
			`UPDATE bapX_agent_submissions
			 SET status = 'queued', attempt_id = NULL, recovery_requested_at = NULL, started_at = NULL, owner_id = NULL, lease_expires_at = 0
			 WHERE submission_id = ? AND status = 'running'
			   AND attempt_id = ? AND input_applied_at IS NULL
			 RETURNING submission_id`,
			[attempt.submissionId, attempt.attemptId],
		);
		return rows.length > 0;
	}

	async listPendingSubmissionSettlements(): Promise<import('@bapX/runtime/adapter').SubmissionSettlementObligation[]> {
		const rows = await this.runner.query(`SELECT submission_id, session_key, attempt_id, settlement_record_id, settlement_record FROM bapX_agent_submissions WHERE kind = 'direct' AND status = 'terminalizing' ORDER BY sequence ASC`);
		return rows.map((row) => ({ submissionId: String(row.submission_id), sessionKey: String(row.session_key), attemptId: String(row.attempt_id), recordId: String(row.settlement_record_id), record: JSON.parse(String(row.settlement_record)) }));
	}
	async reserveSubmissionSettlement(attempt: SubmissionAttemptRef, settlement: { recordId: string; record: import('@bapX/runtime/adapter').SubmissionSettledRecord }): Promise<import('@bapX/runtime/adapter').SubmissionSettlementObligation | null> {
		if (settlement.record.id !== settlement.recordId) return null;
		const data = JSON.stringify(settlement.record);
		const rows = await this.runner.query(`UPDATE bapX_agent_submissions SET status = 'terminalizing', settlement_record_id = ?, settlement_record = ? WHERE submission_id = ? AND kind = 'direct' AND status = 'running' AND attempt_id = ? AND owner_id IS NOT NULL AND settlement_record_id IS NULL RETURNING submission_id, session_key, attempt_id, settlement_record_id, settlement_record`, [settlement.recordId, data, attempt.submissionId, attempt.attemptId]);
		const row = rows[0] ?? (await this.runner.query(`SELECT submission_id, session_key, attempt_id, settlement_record_id, settlement_record FROM bapX_agent_submissions WHERE submission_id = ? AND status = 'terminalizing' AND attempt_id = ?`, [attempt.submissionId, attempt.attemptId]))[0];
		return row?.settlement_record_id === settlement.recordId && row?.settlement_record === data ? { submissionId: String(row.submission_id), sessionKey: String(row.session_key), attemptId: String(row.attempt_id), recordId: String(row.settlement_record_id), record: JSON.parse(String(row.settlement_record)) } : null;
	}
	async finalizeSubmissionSettlement(attempt: SubmissionAttemptRef, recordId: string): Promise<boolean> {
		const rows = await this.runner.query(`UPDATE bapX_agent_submissions SET status = 'settled', settled_at = ? WHERE submission_id = ? AND status = 'terminalizing' AND attempt_id = ? AND settlement_record_id = ? RETURNING submission_id`, [Date.now(), attempt.submissionId, attempt.attemptId, recordId]);
		return rows.length > 0;
	}

	async completeSubmission(attempt: SubmissionAttemptRef): Promise<boolean> {
		const rows = await this.runner.query(
			`UPDATE bapX_agent_submissions
			 SET status = 'settled', settled_at = ?, error = NULL
			 WHERE submission_id = ? AND status = 'running' AND attempt_id = ?
			 RETURNING submission_id`,
			[Date.now(), attempt.submissionId, attempt.attemptId],
		);
		return rows.length > 0;
	}

	async failSubmission(attempt: SubmissionAttemptRef, error: unknown): Promise<boolean> {
		const rows = await this.runner.query(
			`UPDATE bapX_agent_submissions
			 SET status = 'settled', settled_at = ?, error = ?
			 WHERE submission_id = ? AND status = 'running' AND attempt_id = ?
			 RETURNING submission_id`,
			[
				Date.now(),
				error instanceof Error ? error.message : String(error),
				attempt.submissionId,
				attempt.attemptId,
			],
		);
		return rows.length > 0;
	}

	// ── Attempt markers ──────────────────────────────────────────────────

	async insertAttemptMarker(attempt: SubmissionAttemptRef): Promise<void> {
		await this.runner.query(
			`INSERT OR IGNORE INTO bapX_agent_attempt_markers (submission_id, attempt_id, created_at)
			 VALUES (?, ?, ?)`,
			[attempt.submissionId, attempt.attemptId, Date.now()],
		);
	}

	async deleteAttemptMarker(attempt: SubmissionAttemptRef): Promise<void> {
		await this.runner.query(
			'DELETE FROM bapX_agent_attempt_markers WHERE submission_id = ? AND attempt_id = ?',
			[attempt.submissionId, attempt.attemptId],
		);
	}

	async listAttemptMarkers(): Promise<AgentAttemptMarker[]> {
		const rows = await this.runner.query(
			'SELECT submission_id, attempt_id, created_at FROM bapX_agent_attempt_markers',
		);
		return rows.map((row) => {
			const createdAt = Number(row.created_at);
			if (
				typeof row.submission_id !== 'string' ||
				typeof row.attempt_id !== 'string' ||
				!Number.isFinite(createdAt)
			) {
				throw new Error('[bapX] Persisted attempt marker row is malformed.');
			}
			return { submissionId: row.submission_id, attemptId: row.attempt_id, createdAt };
		});
	}

	// ── Lease management ────────────────────────────────────────────────

	async renewLeases(ownerId: string, submissionIds: string[]): Promise<void> {
		if (submissionIds.length === 0) return;
		const now = Date.now();
		const leaseExpiresAt = now + LEASE_DURATION_MS;
		const placeholders = submissionIds.map(() => '?').join(', ');
		await this.runner.query(
			`UPDATE bapX_agent_submissions
			 SET lease_expires_at = ?
			 WHERE owner_id = ? AND status = 'running'
			   AND submission_id IN (${placeholders})`,
			[leaseExpiresAt, ownerId, ...submissionIds],
		);
	}

	async listExpiredSubmissions(): Promise<AgentSubmission[]> {
		const now = Date.now();
		return this.runner.transaction(async (tx) => {
			const rows = await tx.query(
				`SELECT ${submissionColumns}
			 FROM bapX_agent_submissions
			 WHERE status = 'running' AND lease_expires_at > 0 AND lease_expires_at < ?
			 ORDER BY sequence ASC`,
				[now],
			);
			return this.parseOperationalRows(rows, 'active', tx);
		});
	}

	// ── Private ──────────────────────────────────────────────────────────

	private async admitSubmission(input: AgentSubmissionInput): Promise<AgentDispatchAdmission> {
		return this.runner.transaction(async (tx) => {
			const chunkStore = createLibsqlChunkStore(tx);
			return admitSubmissionWithBackend<SqlRow>(input, {
				getDispatchReceipt: async (submissionId) => {
					const receiptRows = await tx.query(
						'SELECT dispatch_id, accepted_at FROM bapX_agent_dispatch_receipts WHERE dispatch_id = ? LIMIT 1',
						[submissionId],
					);
					return receiptRows[0] ? parseDispatchReceipt(receiptRows[0]) : null;
				},
				insertIfAbsent: async (row) => {
					await tx.query(
						`INSERT OR IGNORE INTO bapX_agent_submissions
						 (submission_id, session_key, kind, payload, status, accepted_at)
						 VALUES (?, ?, ?, ?, 'queued', ?)`,
						[row.submissionId, row.sessionKey, row.kind, row.payload, row.acceptedAt],
					);
				},
				getExisting: async (submissionId) =>
					(
						await tx.query(
							`SELECT ${submissionColumns} FROM bapX_agent_submissions WHERE submission_id = ? LIMIT 1`,
							[submissionId],
						)
					)[0],
				readChunks: (owner) => chunkStore.read(owner),
				replaceChunks: (owner, chunks) => chunkStore.replace(owner, chunks),
				parseSubmission,
			});
		});
	}


	private async parseOperationalRows(
		rows: SqlRow[],
		status: 'queued' | 'active',
		runner: LibsqlQueryRunner,
	): Promise<AgentSubmission[]> {
		const submissions: AgentSubmission[] = [];
		const chunkStore = createLibsqlChunkStore(runner);
		for (const row of rows) {
			try {
				submissions.push(
					parseSubmission(
						row,
						await chunkStore.read(submissionChunkOwner(String(row.submission_id))),
					),
				);
			} catch (error) {
				const seq = Number(row.sequence);
				if (!Number.isFinite(seq)) throw error;
				console.error('[bapX] Terminating malformed submission (sequence %d):', seq, error);
				await this.failSubmissionSequence(seq, status, error, runner);
			}
		}
		return submissions;
	}

	private async failSubmissionSequence(
		sequence: number,
		status: 'queued' | 'active',
		error: unknown,
		runner: LibsqlQueryRunner = this.runner,
	): Promise<void> {
		const statusFilter = status === 'queued' ? "status = 'queued'" : "status = 'running'";
		await runner.query(
			`UPDATE bapX_agent_submissions
			 SET status = 'settled', settled_at = ?, error = ?
			 WHERE sequence = ? AND ${statusFilter}`,
			[Date.now(), error instanceof Error ? error.message : String(error), sequence],
		);
	}
}

// ─── Submission row parsers ─────────────────────────────────────────────────

function parseDispatchReceipt(row: SqlRow): { submissionId: string; acceptedAt: number } {
	const acceptedAt = Number(row.accepted_at);
	if (typeof row.dispatch_id !== 'string' || !Number.isFinite(acceptedAt)) {
		throw new Error('[bapX] Persisted dispatch receipt row is malformed.');
	}
	return { submissionId: row.dispatch_id, acceptedAt };
}
// Intentionally adapter-specific: each backend has its own column types,
// coercion rules, and storage representation. libSQL returns INTEGER columns
// as JS numbers, so `Number(...)` coercion is safe and idempotent.

function parseSubmission(row: SqlRow, chunks: readonly PersistedChunkRow[]): AgentSubmission {
	const sequence = Number(row.sequence);
	const acceptedAt = Number(row.accepted_at);
	const canonicalReadyAt = row.canonical_ready_at != null ? Number(row.canonical_ready_at) : null;
	const attemptCount = Number(row.attempt_count);
	const maxRetry = Number(row.max_retry);
	const timeoutAt = Number(row.timeout_at);

	const attemptId = row.attempt_id != null ? String(row.attempt_id) : undefined;
	const inputAppliedAt = row.input_applied_at != null ? Number(row.input_applied_at) : undefined;
	const recoveryRequestedAt =
		row.recovery_requested_at != null ? Number(row.recovery_requested_at) : undefined;
	const abortRequestedAt =
		row.abort_requested_at != null ? Number(row.abort_requested_at) : undefined;
	const startedAt = row.started_at != null ? Number(row.started_at) : undefined;
	const ownerId = row.owner_id != null ? String(row.owner_id) : undefined;
	const leaseExpiresAt = Number(row.lease_expires_at);

	if (
		!Number.isFinite(sequence) ||
		typeof row.submission_id !== 'string' ||
		typeof row.session_key !== 'string' ||
		(row.kind !== 'dispatch' && row.kind !== 'direct') ||
		typeof row.payload !== 'string' ||
		(row.status !== 'queued' && row.status !== 'running' && row.status !== 'terminalizing' && row.status !== 'settled') ||
		!Number.isFinite(acceptedAt) ||
		(canonicalReadyAt !== null && !Number.isFinite(canonicalReadyAt)) ||
		// Status-specific invariants: queued rows must not have running fields,
		// running rows must have attemptId and startedAt.
		(row.status === 'queued' &&
			(attemptId !== undefined ||
				inputAppliedAt !== undefined ||
				recoveryRequestedAt !== undefined ||
				startedAt !== undefined)) ||
		(row.status === 'running' && (attemptId === undefined || startedAt === undefined)) ||
		!Number.isFinite(attemptCount) ||
		!Number.isFinite(maxRetry) ||
		!Number.isFinite(timeoutAt) ||
		!Number.isFinite(leaseExpiresAt)
	) {
		throw new Error('[bapX] Persisted agent submission row is malformed.');
	}

	const parsedInput = JSON.parse(row.payload) as AgentSubmissionInput;
	const input = hydratePersistedSubmissionAttachments(parsedInput, chunks);
	if (
		!isSubmissionPayload(input, {
			kind: row.kind as string,
			submissionId: row.submission_id as string,
			sessionKey: row.session_key as string,
			acceptedAt,
		})
	) {
		throw new Error('[bapX] Persisted agent submission payload is malformed.');
	}

	const error = row.error != null ? String(row.error) : undefined;

	return {
		sequence,
		submissionId: row.submission_id,
		sessionKey: row.session_key,
		kind: row.kind,
		input,
		status: row.status,
		acceptedAt,
		canonicalReadyAt,
		...(attemptId !== undefined ? { attemptId } : {}),
		...(inputAppliedAt !== undefined ? { inputAppliedAt } : {}),
		...(recoveryRequestedAt !== undefined ? { recoveryRequestedAt } : {}),
		...(abortRequestedAt !== undefined ? { abortRequestedAt } : {}),
		...(startedAt !== undefined ? { startedAt } : {}),
		...(error !== undefined ? { error } : {}),
		attemptCount,
		maxRetry,
		timeoutAt,
		...(ownerId !== undefined ? { ownerId } : {}),
		leaseExpiresAt,
	};
}

// ─── Run store ──────────────────────────────────────────────────────────────

class LibsqlRunStore implements RunStore {
	constructor(private runner: LibsqlRunner) {}

	async createRun(input: CreateRunInput): Promise<void> {
		// Idempotent first-writer-wins: a replayed runId must neither raise a
		// unique violation nor resurrect a terminal record back to 'active'.
		await this.runner.query(
			`INSERT OR IGNORE INTO bapX_runs
			 (run_id, workflow_name, status, started_at, payload, traceparent, tracestate)
			 VALUES (?, ?, 'active', ?, ?, ?, ?)`,
			[
				input.runId,
				input.workflowName,
				input.startedAt,
				input.input !== undefined ? JSON.stringify(input.input) : null,
				input.traceCarrier?.traceparent ?? null,
				input.traceCarrier?.tracestate ?? null,
			],
		);
	}

	async endRun(input: EndRunInput): Promise<void> {
		await this.runner.query(
			`UPDATE bapX_runs
			 SET status = ?, ended_at = ?, is_error = ?, duration_ms = ?, result = ?, error = ?
			 WHERE run_id = ?`,
			[
				input.isError ? 'errored' : 'completed',
				input.endedAt,
				input.isError ? 1 : 0,
				input.durationMs,
				input.result !== undefined ? JSON.stringify(input.result) : null,
				input.error !== undefined ? JSON.stringify(input.error) : null,
				input.runId,
			],
		);
	}

	async getRun(runId: string): Promise<RunRecord | null> {
		const rows = await this.runner.query(
			`SELECT run_id, workflow_name, status, started_at,
			        payload, traceparent, tracestate, ended_at, is_error, duration_ms, result, error
			 FROM bapX_runs WHERE run_id = ? LIMIT 1`,
			[runId],
		);
		const row = rows[0];
		if (!row) return null;
		return {
			runId: String(row.run_id),
			workflowName: String(row.workflow_name),
			status: row.status as RunStatus,
			startedAt: String(row.started_at),
			...(row.payload != null ? { input: JSON.parse(String(row.payload)) } : {}),
			...(typeof row.traceparent === 'string'
				? {
						traceCarrier: {
							traceparent: row.traceparent,
							...(typeof row.tracestate === 'string' ? { tracestate: row.tracestate } : {}),
						},
					}
				: {}),
			...(row.ended_at != null ? { endedAt: String(row.ended_at) } : {}),
			...(row.is_error != null ? { isError: parseSqliteBoolean(row.is_error) } : {}),
			...(row.duration_ms != null ? { durationMs: Number(row.duration_ms) } : {}),
			...(row.result != null ? { result: JSON.parse(String(row.result)) } : {}),
			...(row.error != null ? { error: JSON.parse(String(row.error)) } : {}),
		};
	}

	async lookupRun(runId: string): Promise<WorkflowRunPointer | null> {
		const rows = await this.runner.query(
			`SELECT run_id, workflow_name
			 FROM bapX_runs WHERE run_id = ? LIMIT 1`,
			[runId],
		);
		const row = rows[0];
		if (!row) return null;
		return { runId: String(row.run_id), workflowName: String(row.workflow_name) };
	}

	async listRuns(opts: ListRunsOpts = {}): Promise<ListRunsResponse> {
		const limit = clampLimit(opts.limit, DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT);
		const cursor = decodeRunCursor(opts.cursor);

		const conditions: string[] = [];
		const params: LibsqlParameter[] = [];

		if (opts.status) {
			conditions.push(`status = ?`);
			params.push(opts.status);
		}
		if (opts.workflowName) {
			conditions.push(`workflow_name = ?`);
			params.push(opts.workflowName);
		}
		if (cursor) {
			conditions.push(`(started_at < ? OR (started_at = ? AND run_id < ?))`);
			params.push(cursor.startedAt, cursor.startedAt, cursor.runId);
		}

		const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
		// Fetch one extra row to determine if there's a next page.
		const fetchLimit = limit + 1;

		const rows = await this.runner.query(
			`SELECT run_id, workflow_name, status, started_at,
			        ended_at, duration_ms, is_error
			 FROM bapX_runs
			 ${where}
			 ORDER BY started_at DESC, run_id DESC
			 LIMIT ?`,
			[...params, fetchLimit],
		);

		const hasNext = rows.length > limit;
		const pageRows = hasNext ? rows.slice(0, limit) : rows;
		const runs = pageRows.map(parseRunPointer);
		const last = pageRows.at(-1);
		const nextCursor = hasNext && last ? encodeRunCursor(parseRunPointer(last)) : undefined;
		return { runs, nextCursor };
	}
}

function parseSqliteBoolean(value: unknown): boolean {
	const numeric = Number(value);
	if (numeric !== 0 && numeric !== 1) {
		throw new Error('[bapX] Persisted SQLite boolean is malformed.');
	}
	return numeric === 1;
}

function parseRunPointer(row: SqlRow): RunPointer {
	return {
		runId: String(row.run_id),
		workflowName: String(row.workflow_name),
		status: row.status as RunStatus,
		startedAt: String(row.started_at),
		...(row.ended_at != null ? { endedAt: String(row.ended_at) } : {}),
		...(row.duration_ms != null ? { durationMs: Number(row.duration_ms) } : {}),
		...(row.is_error != null ? { isError: parseSqliteBoolean(row.is_error) } : {}),
	};
}

// ─── Event stream store ─────────────────────────────────────────────────────

class LibsqlEventStreamStore implements EventStreamStore {
	private listeners = new Map<string, Set<() => void>>();
	private pendingAppends = new Map<string, Promise<void>>();

	constructor(private runner: LibsqlRunner) {}

	async createStream(path: string): Promise<void> {
		await this.runner.query(`INSERT OR IGNORE INTO bapX_event_streams (path) VALUES (?)`, [path]);
	}

	async appendEvent(path: string, event: unknown): Promise<string> {
		const previous = this.pendingAppends.get(path) ?? Promise.resolve();
		const append = previous.then(async () => {
			const data = JSON.stringify(event);
			const offset = await this.runner.transaction(async (tx) => {
				const updated = await tx.query(
					`UPDATE bapX_event_streams
					 SET next_offset = next_offset + 1
					 WHERE path = ? AND closed = 0
					 RETURNING next_offset`,
					[path],
				);

				if (updated.length === 0) {
					const meta = await this.getStreamMetaFromRunner(tx, path);
					if (!meta) {
						throw new Error(`[bapX] Event stream "${path}" does not exist.`);
					}
					throw new Error(`[bapX] Event stream "${path}" is closed.`);
				}

				const seq = Number(updated[0]?.next_offset) - 1;
				await tx.query(`INSERT INTO bapX_event_stream_entries (path, seq, data) VALUES (?, ?, ?)`, [
					path,
					seq,
					data,
				]);
				return seq;
			});

			this.notifyListeners(path);
			return formatOffset(offset);
		});
		const settled = append.then(
			() => undefined,
			() => undefined,
		);
		this.pendingAppends.set(path, settled);
		try {
			return await append;
		} finally {
			if (this.pendingAppends.get(path) === settled) {
				this.pendingAppends.delete(path);
			}
		}
	}

	async appendEventOnce(path: string, key: string, event: unknown): Promise<string> {
		const data = JSON.stringify(event);
		const offset = await this.runner.transaction(async (tx) => {
			const existing = await tx.query(`SELECT seq, data FROM bapX_event_stream_entries WHERE path = ? AND event_key = ? LIMIT 1`, [path, key]);
			if (existing[0]) {
				if (existing[0].data !== data) throw new TypeError(`Event key "${key}" has a conflicting payload.`);
				return Number(existing[0].seq);
			}
			const updated = await tx.query(`UPDATE bapX_event_streams SET next_offset = next_offset + 1 WHERE path = ? AND closed = 0 RETURNING next_offset`, [path]);
			if (!updated[0]) {
				const meta = await this.getStreamMetaFromRunner(tx, path);
				throw new TypeError(meta ? `Event stream "${path}" is closed.` : `Event stream "${path}" does not exist.`);
			}
			const seq = Number(updated[0].next_offset) - 1;
			await tx.query(`INSERT INTO bapX_event_stream_entries (path, seq, data, event_key) VALUES (?, ?, ?, ?)`, [path, seq, data, key]);
			return seq;
		});
		this.notifyListeners(path);
		return formatOffset(offset);
	}

	async readEvents(
		path: string,
		opts?: { offset?: string; limit?: number },
	): Promise<EventStreamReadResult> {
		const meta = await this.getStreamMeta(path);
		if (!meta) {
			return { events: [], nextOffset: formatOffset(-1), upToDate: true, closed: false };
		}

		const rawOffset = opts?.offset ?? '-1';
		const limit = clampLimit(opts?.limit, DEFAULT_READ_LIMIT, MAX_READ_LIMIT);

		let startAfter: number;
		if (rawOffset === '-1') {
			startAfter = -1;
		} else if (rawOffset === 'now') {
			return {
				events: [],
				nextOffset: meta.nextOffset,
				upToDate: true,
				closed: meta.closed,
			};
		} else {
			startAfter = parseOffset(rawOffset);
		}

		// Fetch one extra row so an exactly-limit page at the tail still
		// reports up-to-date (mirrors SqliteEventStreamStore).
		const rows = await this.runner.query(
			`SELECT seq, data FROM bapX_event_stream_entries
			 WHERE path = ? AND seq > ?
			 ORDER BY seq ASC
			 LIMIT ?`,
			[path, startAfter, limit + 1],
		);
		const page = rows.slice(0, limit);

		const events = page.map((row) => ({
			data: JSON.parse(row.data as string) as unknown,
			offset: formatOffset(Number(row.seq)),
		}));

		const lastSeq = events.length > 0 ? Number(page.at(-1)?.seq) : -1;
		const upToDate = rows.length <= limit;

		const nextOffset = events.length > 0 ? formatOffset(lastSeq) : formatOffset(startAfter);

		return {
			events,
			nextOffset,
			upToDate,
			closed: meta.closed,
		};
	}

	async closeStream(path: string): Promise<void> {
		await this.runner.query(`UPDATE bapX_event_streams SET closed = 1 WHERE path = ?`, [path]);
		this.notifyListeners(path);
	}

	async getStreamMeta(path: string): Promise<EventStreamMeta | null> {
		return this.getStreamMetaFromRunner(this.runner, path);
	}

	private async getStreamMetaFromRunner(
		runner: { query: LibsqlQuery },
		path: string,
	): Promise<EventStreamMeta | null> {
		const rows = await runner.query(
			`SELECT next_offset, closed FROM bapX_event_streams WHERE path = ?`,
			[path],
		);

		const row = rows[0];
		if (!row) return null;
		const writeHead = Number(row.next_offset);
		return {
			nextOffset: formatOffset(writeHead - 1),
			closed: parseSqliteBoolean(row.closed),
		};
	}

	subscribe(path: string, listener: () => void): () => void {
		let bucket = this.listeners.get(path);
		if (!bucket) {
			bucket = new Set();
			this.listeners.set(path, bucket);
		}
		bucket.add(listener);
		const listeners = bucket;
		return () => {
			listeners.delete(listener);
			if (listeners.size === 0) {
				this.listeners.delete(path);
			}
		};
	}

	private notifyListeners(path: string): void {
		const bucket = this.listeners.get(path);
		if (bucket) {
			for (const listener of [...bucket]) {
				try {
					listener();
				} catch {
					// Listener errors are silently dropped.
				}
			}
		}
	}
}
