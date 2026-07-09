import {
	type ExtractedImages,
	extractSubmissionAttachments,
	hydrateSubmissionAttachments,
	type PersistedImageChunk,
} from './persisted-images.ts';
import type { AgentSubmissionInput } from './runtime/agent-submissions.ts';

export interface PersistedChunkOwner {
	kind: 'submission';
	id: string;
	part: '';
}

export interface PersistedChunkRow {
	imageId: string;
	index: number;
	count: number;
	data: string;
}

export interface PersistedChunkStore<Result = void> {
	read(
		owner: PersistedChunkOwner,
	): Result extends Promise<unknown> ? Promise<PersistedChunkRow[]> : PersistedChunkRow[];
	replace(owner: PersistedChunkOwner, chunks: readonly PersistedImageChunk[]): Result;
	delete(owner: PersistedChunkOwner): Result;
	deleteMany(owners: readonly PersistedChunkOwner[]): Result;
	deleteOwner(kind: PersistedChunkOwner['kind'], id: string): Result;
}

export function submissionChunkOwner(submissionId: string): PersistedChunkOwner {
	return { kind: 'submission', id: submissionId, part: '' };
}

/**
 * Extract and chunk a submission's attachments (present only on a `kind:
 * 'user'` message) for oversized-row-safe storage. Applies to both direct
 * and dispatch submissions — attachments are a property of the message, not
 * the transport.
 */
export function prepareSubmissionAttachments(
	input: AgentSubmissionInput,
): ExtractedImages<AgentSubmissionInput> {
	return extractSubmissionAttachments(input);
}

export function hydratePersistedSubmissionAttachments(
	input: AgentSubmissionInput,
	rows: readonly PersistedChunkRow[],
): AgentSubmissionInput {
	return hydrateSubmissionAttachments(input, reassemblePersistedChunks(rows));
}

export function matchesPersistedSubmissionAttachments(
	input: AgentSubmissionInput,
	persistedInput: AgentSubmissionInput,
	rows: readonly PersistedChunkRow[],
): boolean {
	try {
		return (
			JSON.stringify(hydratePersistedSubmissionAttachments(persistedInput, rows)) ===
			JSON.stringify(input)
		);
	} catch {
		return false;
	}
}

function reassemblePersistedChunks(
	rows: readonly PersistedChunkRow[],
): ReadonlyMap<string, string> {
	const grouped = new Map<string, PersistedChunkRow[]>();
	for (const row of rows) {
		const imageRows = grouped.get(row.imageId) ?? [];
		imageRows.push(row);
		grouped.set(row.imageId, imageRows);
	}
	const data = new Map<string, string>();
	for (const [imageId, imageRows] of grouped) {
		const ordered = imageRows.toSorted((left, right) => left.index - right.index);
		const expectedCount = ordered[0]?.count;
		if (
			expectedCount === undefined ||
			expectedCount < 1 ||
			ordered.length !== expectedCount ||
			ordered.some((row, index) => row.count !== expectedCount || row.index !== index)
		) {
			throw new Error('[bapX] Persisted image chunks are missing or malformed.');
		}
		data.set(imageId, ordered.map((row) => row.data).join(''));
	}
	return data;
}

export function samePersistedChunks(
	left: readonly PersistedChunkRow[],
	right: readonly PersistedImageChunk[],
): boolean {
	if (left.length !== right.length) return false;
	const rightByKey = new Map(right.map((chunk) => [chunkKey(chunk), chunk]));
	return left.every((chunk) => {
		const other = rightByKey.get(chunkKey(chunk));
		return other !== undefined && chunk.count === other.count && chunk.data === other.data;
	});
}

function chunkKey(chunk: Pick<PersistedChunkRow, 'imageId' | 'index'>): string {
	return `${chunk.imageId}\u0000${chunk.index}`;
}
