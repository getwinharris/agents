import { createSessionStorageKey, PersistedSchemaVersionError } from '@bapX/runtime/adapter';
import { describe, expect, it } from 'vitest';
import {
	type MongoCollection,
	type MongoRunner,
	mongodb,
	runMongoTransactionWithRetry,
} from '../src/index.ts';
import { MongoSubmissionStore } from '../src/submission-store.ts';
import { type StoredValue, ValueStore } from '../src/value-store.ts';

function result(matchedCount = 1, deletedCount = 1) {
	return { acknowledged: true, matchedCount, modifiedCount: matchedCount, deletedCount };
}
function collection(overrides: Partial<MongoCollection> = {}): MongoCollection {
	return {
		findOne: async () => null,
		find: async () => [],
		insertOne: async () => result(),
		insertMany: async () => result(),
		updateOne: async () => result(),
		updateMany: async () => result(),
		findOneAndUpdate: async () => null,
		deleteOne: async () => result(),
		deleteMany: async () => result(),
		...overrides,
	};
}
function runner(overrides: Partial<MongoRunner> = {}): MongoRunner {
	return {
		collection: () => collection(),
		transaction: (fn) => fn({ collection: () => collection() }),
		topology: async () => ({ kind: 'replica_set', transactions: true }),
		ensureCollection: async () => {},
		inspectCollection: async (_name: string) => ({
			validator: { $jsonSchema: { bsonType: 'object', required: ['_id'] } },
			validationLevel: 'strict',
			validationAction: 'error',
			indexes: [],
		}),
		close: () => {},
		...overrides,
	};
}

describe('mongodb() migration guards', () => {
	it('rejects a newer version before topology or DDL', async () => {
		let topologyCalls = 0;
		let ddlCalls = 0;
		const adapter = mongodb(
			runner({
				collection: () =>
					collection({
						findOne: async (filter) =>
							filter._id === 'schema_version' ? { _id: 'schema_version', value: 999 } : null,
					}),
				topology: async () => {
					topologyCalls++;
					return { kind: 'replica_set', transactions: true };
				},
				ensureCollection: async () => {
					ddlCalls++;
				},
			}),
		);
		await expect(adapter.migrate?.()).rejects.toThrow(PersistedSchemaVersionError);
		expect(topologyCalls).toBe(0);
		expect(ddlCalls).toBe(0);
	});
	it('rejects unversioned Bapx persistence before topology or DDL', async () => {
		let topologyCalls = 0;
		let ddlCalls = 0;
		const adapter = mongodb(
			runner({
				collection: (name) =>
					collection({
						findOne: async () => (name === 'bapX_runs' ? { _id: 'legacy' } : null),
					}),
				topology: async () => {
					topologyCalls++;
					return { kind: 'replica_set', transactions: true };
				},
				ensureCollection: async () => {
					ddlCalls++;
				},
			}),
		);
		await expect(adapter.migrate?.()).rejects.toThrow(PersistedSchemaVersionError);
		expect(topologyCalls).toBe(0);
		expect(ddlCalls).toBe(0);
	});
	it('does not treat migration-lock metadata as existing data', async () => {
		let topologyCalls = 0;
		let metaDataFilter: Record<string, unknown> | undefined;
		const adapter = mongodb(
			runner({
				collection: (name) =>
					collection({
						findOne: async (filter) => {
							if (name === 'bapX_meta' && typeof filter._id === 'object') metaDataFilter = filter;
							return null;
						},
					}),
				topology: async () => {
					topologyCalls++;
					return { kind: 'standalone', transactions: false };
				},
			}),
		);
		await expect(adapter.migrate?.()).rejects.toThrow('requires a replica set');
		expect(metaDataFilter).toEqual({ _id: { $nin: ['schema_version', 'migration_lock'] } });
		expect(topologyCalls).toBe(1);
	});
	it('gates connect before successful migration', () => {
		expect(() => mongodb(runner()).connect()).toThrow('successful migrate()');
	});
});

describe('runMongoTransactionWithRetry()', () => {
	it('retries the callback for transient transaction errors', async () => {
		let callbacks = 0;
		let sessions = 0;
		const value = await runMongoTransactionWithRetry(
			() => ({
				start() {},
				commit: async () => {},
				abort: async () => {},
				end: async () => {},
				operations: { collection: () => collection() },
			}),
			async () => {
				callbacks++;
				sessions++;
				if (callbacks === 1) throw { label: 'TransientTransactionError' };
				return 'ok';
			},
			{ hasErrorLabel: (error, label) => (error as { label?: string }).label === label },
		);
		expect(value).toBe('ok');
		expect(callbacks).toBe(2);
		expect(sessions).toBe(2);
	});
	it('retries only commit for unknown commit results', async () => {
		let callbacks = 0;
		let commits = 0;
		await runMongoTransactionWithRetry(
			() => ({
				start() {},
				commit: async () => {
					commits++;
					if (commits < 3) throw { label: 'UnknownTransactionCommitResult' };
				},
				abort: async () => {},
				end: async () => {},
				operations: { collection: () => collection() },
			}),
			async () => {
				callbacks++;
			},
			{ hasErrorLabel: (error, label) => (error as { label?: string }).label === label },
		);
		expect(callbacks).toBe(1);
		expect(commits).toBe(3);
	});
	it('bounds commit retries', async () => {
		let commits = 0;
		await expect(
			runMongoTransactionWithRetry(
				() => ({
					start() {},
					commit: async () => {
						commits++;
						throw { label: 'UnknownTransactionCommitResult' };
					},
					abort: async () => {},
					end: async () => {},
					operations: { collection: () => collection() },
				}),
				async () => {},
				{
					maxCommitAttempts: 2,
					hasErrorLabel: (error, label) => (error as { label?: string }).label === label,
				},
			),
		).rejects.toEqual({ label: 'UnknownTransactionCommitResult' });
		expect(commits).toBe(2);
	});
});

describe('MongoSubmissionStore update semantics', () => {
	it('initializes claim timeout only when timeoutAt is zero', async () => {
		let update: unknown;
		const submission = {
			submissionId: 's',
			sessionKey: 'k',
			status: 'queued',
			sequence: 1,
			timeoutAt: 123,
		};
		const submissions = collection({
			findOne: async (filter) => (filter.submissionId ? submission : null),
			findOneAndUpdate: async (_filter, value) => {
				update = value;
				return null;
			},
		});
		const store = new MongoSubmissionStore(
			runner({
				collection: (name) => (name.endsWith('submissions') ? submissions : collection()),
				transaction: (fn) =>
					fn({ collection: (name) => (name.endsWith('submissions') ? submissions : collection()) }),
			}),
			'bapX_',
		);
		await store.claimSubmission({
			submissionId: 's',
			attemptId: 'a',
			ownerId: 'o',
			leaseExpiresAt: 1,
		});
		expect(update).toEqual([
			{
				$set: expect.objectContaining({
					timeoutAt: { $cond: [{ $eq: ['$timeoutAt', 0] }, expect.any(Number), '$timeoutAt'] },
				}),
			},
		]);
	});
	it('uses set-once expressions for input and recovery timestamps', async () => {
		const updates: unknown[] = [];
		const submissions = collection({
			updateOne: async (_filter, update) => {
				updates.push(update);
				return result();
			},
		});
		const store = new MongoSubmissionStore(
			runner({ collection: (name) => (name.endsWith('submissions') ? submissions : collection()) }),
			'bapX_',
		);
		await store.markSubmissionInputApplied({ submissionId: 's', attemptId: 'a' });
		await store.requestSubmissionRecovery({ submissionId: 's', attemptId: 'a' });
		expect(updates[0]).toEqual([
			{
				$set: expect.objectContaining({
					inputAppliedAt: { $ifNull: ['$inputAppliedAt', expect.any(Number)] },
				}),
			},
		]);
		expect(updates[1]).toEqual([
			{ $set: { recoveryRequestedAt: { $ifNull: ['$recoveryRequestedAt', expect.any(Number)] } } },
		]);
	});
});

describe('MongoSubmissionStore malformed rows', () => {
	it('terminalizes a malformed row and keeps listing the rest', async () => {
		const acceptedAt = '2026-06-03T00:00:00.000Z';
		const healthyInput = {
			kind: 'dispatch',
			submissionId: 'healthy',
			agent: 'assistant',
			id: 'agent-1',
			message: { kind: 'signal', type: 'test.event', body: 'go' },
			acceptedAt,
		};
		const row = (submissionId: string, sequence: number) => ({
			_id: submissionId,
			submissionId,
			sessionKey: createSessionStorageKey('agent-1', 'default', 'default'),
			kind: 'dispatch',
			payload: { owner: `submission:${submissionId}`, generation: `g-${submissionId}`, count: 1 },
			status: 'running',
			canonicalReadyAt: 1,
			acceptedAt: Date.parse(acceptedAt),
			sequence,
			attemptId: 'attempt-1',
			startedAt: 2,
			attemptCount: 1,
			maxRetry: 10,
			timeoutAt: 3,
			leaseExpiresAt: 0,
		});
		// 'malformed' has no persisted value parts, so its payload read throws.
		const valueParts = [
			{
				owner: 'submission:healthy',
				generation: 'g-healthy',
				index: 0,
				count: 1,
				data: JSON.stringify([healthyInput]),
			},
		];
		const updates: Array<{ filter: unknown; update: unknown }> = [];
		const submissions = collection({
			find: async () => [row('malformed', 1), row('healthy', 2)],
			updateOne: async (filter, update) => {
				updates.push({ filter, update });
				return result();
			},
		});
		const values = collection({
			find: async (filter = {}) =>
				valueParts.filter(
					(part) => part.owner === filter.owner && part.generation === filter.generation,
				),
		});
		const store = new MongoSubmissionStore(
			runner({
				collection: (name) =>
					name.endsWith('submissions')
						? submissions
						: name.endsWith('values')
							? values
							: collection(),
			}),
			'bapX_',
		);
		const running = await store.listRunningSubmissions();
		expect(running.map((submission) => submission.submissionId)).toEqual(['healthy']);
		expect(updates).toEqual([
			{
				filter: { sequence: 1, status: 'running' },
				update: {
					$set: {
						status: 'settled',
						settledAt: expect.any(Number),
						error: expect.stringContaining('incomplete'),
					},
				},
			},
		]);
	});
});

describe('ValueStore publication cleanup', () => {
	it('does not delete published generations through staged cleanup', async () => {
		let state = 'staged';
		let partDeletes = 0;
		const registry = collection({
			updateOne: async () => {
				state = 'published';
				return result();
			},
			deleteOne: async (filter) =>
				result(filter.state === state ? 1 : 0, filter.state === state ? 1 : 0),
		});
		const values = collection({
			deleteMany: async () => {
				partDeletes++;
				return result();
			},
		});
		const valueStore = new ValueStore(
			runner({ collection: (name) => (name.endsWith('value_generations') ? registry : values) }),
			'bapX_',
		);
		const pointer: StoredValue = { owner: 'o', generation: 'g', count: 1 };
		await valueStore.publish(pointer, { collection: () => registry });
		await valueStore.discardStaged(pointer);
		expect(partDeletes).toBe(0);
	});
	it('cleans partial parts when insertMany fails', async () => {
		let deleted = 0;
		const valueStore = new ValueStore(
			runner({
				collection: (name) =>
					name.endsWith('values')
						? collection({
								insertMany: async () => {
									throw new TypeError('partial');
								},
								deleteMany: async () => {
									deleted++;
									return result();
								},
							})
						: collection(),
			}),
			'bapX_',
		);
		await expect(valueStore.stage('o', { value: true })).rejects.toThrow('partial');
		expect(deleted).toBe(1);
	});
});
