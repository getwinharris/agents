import type { PersistedChunkOwner, PersistedChunkRow, PersistedChunkStore } from '@flue/runtime/adapter';
import type { MongoOperations, MongoRunner } from './mongodb-runner.ts';
import { collectionName } from './schema.ts';
import { type StoredValue, ValueStore } from './value-store.ts';

interface StagedChunks {
	pointer: StoredValue;
	owner: PersistedChunkOwner;
}

export async function stageChunks(runner: MongoRunner, prefix: string, owner: PersistedChunkOwner, chunks: readonly PersistedChunkRow[]): Promise<StagedChunks> {
	const pointer = await new ValueStore(runner, prefix).stage(`chunks:${owner.kind}:${owner.id}:${owner.part}`, chunks);
	return { pointer, owner };
}

export async function publishChunks(operations: MongoOperations, runner: MongoRunner, prefix: string, staged: StagedChunks): Promise<void> {
	await new ValueStore(runner, prefix).publish(staged.pointer, operations);
}

export function createChunkStore(operations: MongoOperations, prefix: string, runner?: MongoRunner): PersistedChunkStore<Promise<void>> {
	const collection = operations.collection(collectionName(prefix, 'chunk_pointers'));
	const values = runner ? new ValueStore(runner, prefix) : null;
	const filter = (owner: PersistedChunkOwner) => ({ ownerKind: owner.kind, ownerId: owner.id, ownerPart: owner.part });
	return {
		async read(owner) {
			const row = await collection.findOne(filter(owner));
			if (!row) return [];
			if (!runner) throw new TypeError('MongoDB chunk reads require a runner.');
			return await new ValueStore(runner, prefix).read(row.pointer as unknown as StoredValue, operations) as PersistedChunkRow[];
		},
		async replace(owner, chunks) {
			if (!runner || !values) throw new TypeError('MongoDB chunk replacement requires a runner.');
			const staged = await stageChunks(runner, prefix, owner, chunks);
			let published = false;
			try {
				const previous = await runner.transaction(async tx => {
					await publishChunks(tx, runner, prefix, staged);
					const pointers = tx.collection(collectionName(prefix, 'chunk_pointers'));
					const old = await pointers.findOne(filter(owner));
					await pointers.updateOne(filter(owner), { $set: { ...filter(owner), pointer: staged.pointer } }, { upsert: true });
					return old?.pointer as StoredValue | undefined;
				});
				published = true;
				if (previous) await values.retire(previous);
			} catch (error) {
				if (!published) await values.discardStaged(staged.pointer);
				throw error;
			}
		},
		async delete(owner) {
			const old = await collection.findOne(filter(owner));
			await collection.deleteMany(filter(owner));
			if (old?.pointer && values) await values.retire(old.pointer as unknown as StoredValue);
		},
		async deleteMany(owners) {
			for (let offset = 0; offset < owners.length; offset += 100) for (const owner of owners.slice(offset, offset + 100)) await this.delete(owner);
		},
		async deleteOwner(kind, id) {
			const rows = await collection.find({ ownerKind: kind, ownerId: id }, { limit: 1000 });
			await collection.deleteMany({ ownerKind: kind, ownerId: id });
			if (values) for (const row of rows) if (row.pointer) await values.retire(row.pointer as unknown as StoredValue);
		},
	};
}
