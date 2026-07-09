import type {
	ConversationRecord,
	ConversationStreamIdentity,
	ConversationStreamMeta,
	ConversationStreamReadResult,
	ConversationStreamStore,
} from '@bapX/runtime/adapter';
import {
	ConversationStreamStoreError,
	clampLimit,
	DEFAULT_READ_LIMIT,
	formatOffset,
	MAX_READ_LIMIT,
	parseOffset,
	StreamListenerRegistry,
} from '@bapX/runtime/adapter';
import {
	acquireConversationProducerScript,
	appendConversationScript,
	createConversationScript,
	deleteConversationScript,
	readConversationScript,
} from './conversation-scripts.ts';
import type { RedisKeys } from './redis-keys.ts';
import type { RedisRunner } from './redis-runner.ts';

function strings(value: unknown): string[] {
	return Array.isArray(value) ? value.map(String) : [];
}

function integer(value: string | undefined): number {
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed)) throw new TypeError('Persisted Redis integer is malformed.');
	return parsed;
}

export class RedisConversationStreamStore implements ConversationStreamStore {
	private listeners = new StreamListenerRegistry();

	constructor(private runner: RedisRunner, private keys: RedisKeys) {}

	async createStream(path: string, identity: ConversationStreamIdentity): Promise<void> {
		const result = strings(await this.runner.eval(
			createConversationScript,
			[this.keys.conversation(path), this.keys.conversations()],
			[JSON.stringify(identity), crypto.randomUUID(), path],
		));
		if (result[0] === 'conflict') throw failure('create', path, 'Stream identity conflicts.');
	}

	async acquireProducer(path: string, producerId: string) {
		const result = strings(await this.runner.eval(
			acquireConversationProducerScript,
			[this.keys.conversation(path)],
			[producerId],
		));
		if (result[0] !== 'acquired') throw failure('acquire_producer', path, 'Stream does not exist.');
		return {
			producerId,
			producerEpoch: integer(result[1]),
			incarnation: result[3] ?? '',
			nextProducerSequence: 0,
			offset: formatOffset(integer(result[2]) - 1),
		};
	}

	async append(input: {
		path: string;
		producerId: string;
		producerEpoch: number;
		incarnation: string;
		producerSequence: number;
		submission?: { submissionId: string; attemptId: string };
		records: readonly ConversationRecord[];
	}): Promise<{ offset: string }> {
		if (input.records.length === 0) throw failure('append', input.path, 'A canonical batch cannot be empty.');
		const owned = input.records.filter((record) => record.submissionId !== undefined || record.attemptId !== undefined);
		if (!input.submission && owned.length > 0) throw failure('append', input.path, 'Submission-owned records require attempt authorization.');
		if (input.submission && owned.some((record) => record.submissionId !== input.submission?.submissionId || record.attemptId !== input.submission?.attemptId)) {
			throw failure('append', input.path, 'Record ownership does not match the authorized submission attempt.');
		}
		const meta = await this.getMeta(input.path);
		if (!meta) throw failure('append', input.path, 'Stream does not exist.');
		const first = input.records[0];
		if (!first) throw failure('append', input.path, 'A canonical batch cannot be empty.');
		const expectedInstanceId = meta.identity.instanceId;
		const submissionKey = input.submission ? this.keys.submission(input.submission.submissionId) : this.keys.meta();
		const result = strings(await this.runner.eval(
			appendConversationScript,
			[
				this.keys.conversation(input.path),
				this.keys.conversationBatches(input.path),
				this.keys.conversationOrder(input.path),
				this.keys.conversationRetries(input.path),
				submissionKey,
			],
			[
				input.producerId,
				input.producerEpoch,
				input.incarnation,
				input.producerSequence,
				JSON.stringify(input.records),
				input.submission?.submissionId ?? '',
				input.submission?.attemptId ?? '',
				expectedInstanceId,
			],
		));
		if (result[0] !== 'appended' && result[0] !== 'retry') {
			throw failure('append', input.path, appendReason(result[0]));
		}
		if (result[0] === 'appended') this.listeners.notify(input.path);
		return { offset: formatOffset(integer(result[1])) };
	}

	async read(path: string, options?: { offset?: string; limit?: number }): Promise<ConversationStreamReadResult> {
		const meta = await this.getMeta(path);
		if (!meta) return { batches: [], nextOffset: '-1', upToDate: true };
		const raw = options?.offset ?? '-1';
		if (raw === 'now') return { batches: [], nextOffset: meta.nextOffset, upToDate: true };
		const start = parseOffset(raw);
		const limit = clampLimit(options?.limit, DEFAULT_READ_LIMIT, MAX_READ_LIMIT);
		const result = strings(await this.runner.eval(
			readConversationScript,
			[
				this.keys.conversation(path),
				this.keys.conversationOrder(path),
				this.keys.conversationBatches(path),
			],
			[start, limit],
		));
		if (result[0] === 'missing') return { batches: [], nextOffset: '-1', upToDate: true };
		if (result[0] === 'offset') throw failure('read', path, 'Read offset is beyond the canonical stream head.');
		if (result[0] !== 'read') throw failure('read', path, 'Persisted canonical batch is malformed.');
		const payload = result.slice(2);
		const batches = [];
		for (let index = 0; index < Math.min(payload.length, limit * 2); index += 2) {
			const sequence = payload[index];
			const data = payload[index + 1];
			if (sequence === undefined || data === undefined) throw failure('read', path, 'Persisted canonical batch is malformed.');
			batches.push({ offset: formatOffset(integer(sequence)), records: JSON.parse(data) as ConversationRecord[] });
		}
		return {
			batches,
			nextOffset: batches.at(-1)?.offset ?? formatOffset(start),
			upToDate: payload.length / 2 <= limit,
		};
	}

	async getMeta(path: string): Promise<ConversationStreamMeta | null> {
		const value = await this.runner.command('HGETALL', [this.keys.conversation(path)]);
		const entries = strings(value);
		if (entries.length === 0) return null;
		const row = Object.fromEntries(Array.from({ length: entries.length / 2 }, (_, index) => [entries[index * 2], entries[index * 2 + 1]]));
		return {
			identity: JSON.parse(row.identity ?? 'null') as ConversationStreamIdentity,
			incarnation: row.incarnation ?? '',
			nextOffset: formatOffset(integer(row.nextOffset) - 1),
			producerId: row.producerId ?? null,
			producerEpoch: integer(row.producerEpoch),
			nextProducerSequence: integer(row.nextProducerSequence),
		};
	}

	async delete(path: string): Promise<void> {
		await this.runner.eval(
			deleteConversationScript,
			[
				this.keys.conversation(path),
				this.keys.conversationBatches(path),
				this.keys.conversationOrder(path),
				this.keys.conversationRetries(path),
				this.keys.conversations(),
			],
			[path],
		);
		this.listeners.notify(path);
	}

	subscribe(path: string, listener: () => void): () => void {
		return this.listeners.subscribe(path, listener);
	}
}

function appendReason(code: string | undefined): string {
	if (code === 'missing') return 'Stream does not exist.';
	if (code === 'stale') return 'Producer ownership is stale.';
	if (code === 'conflict') return 'Producer sequence has conflicting content.';
	if (code === 'sequence') return 'Producer sequence is not the next expected value.';
	if (code === 'attempt') return 'Submission attempt no longer owns work for this session.';
	return 'Canonical append failed.';
}

function failure(operation: string, path: string, reason: string): ConversationStreamStoreError {
	return new ConversationStreamStoreError({ operation, path, reason });
}
