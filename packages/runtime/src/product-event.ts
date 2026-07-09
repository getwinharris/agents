import { ProductEventVersionError } from './errors.ts';
import type { BapxEvent } from './types.ts';

export function assertProductEventV3(value: unknown): asserts value is BapxEvent {
	const version = value && typeof value === 'object' ? (value as { v?: unknown }).v : undefined;
	if (version !== 3) throw new ProductEventVersionError({ storedVersion: version });
}
