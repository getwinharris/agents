import type { DispatchReceipt } from '../types.ts';

export interface DispatchInput {
	dispatchId: string;
	agent: string;
	id: string;
	session: string;
	input: unknown;
	acceptedAt: string;
}

export interface DispatchQueue {
	enqueue(input: DispatchInput): Promise<DispatchReceipt>;
}
