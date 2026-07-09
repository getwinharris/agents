import { describe, expect, it } from 'vitest';
import { InstrumentationAlreadyInstalledError } from '../src/errors.ts';
import type { BapxExecutionInterceptor } from '../src/execution-interceptor.ts';
import {
	createInstrumentationOwner,
	instrument,
	runWithInstrumentationOwner,
} from '../src/instrumentation.ts';

const OWNER = Symbol('owner');

function instrumentation(key = OWNER) {
	return {
		key,
		observe() {},
		interceptor: ((_operation, _context, next) => next()) as BapxExecutionInterceptor,
		dispose() {},
	};
}

describe('instrument()', () => {
	it('rejects a second instrumentation owner with the same key when one is installed', async () => {
		const first = instrumentation();
		const dispose = instrument(first);
		try {
			expect(() => instrument(instrumentation())).toThrow(InstrumentationAlreadyInstalledError);
		} finally {
			await dispose();
		}
	});

	it('releases the installed owner key even when the instrumentation object changes', async () => {
		const owner = instrumentation();
		const dispose = instrument(owner);
		owner.key = Symbol('changed');
		await dispose();
		await instrument(instrumentation())();
	});

	it('allows an instrumentation owner key to be installed again after disposal', async () => {
		await instrument(instrumentation())();
		const dispose = instrument(instrumentation());
		await dispose();
	});

	it('disposes instrumentation installed across asynchronous owner evaluation', async () => {
		const owner = createInstrumentationOwner();
		let disposed = 0;
		await runWithInstrumentationOwner(owner, async () => {
			await Promise.resolve();
			instrument({
				...instrumentation(),
				dispose() {
					disposed += 1;
				},
			});
		});

		await owner.dispose();

		expect(disposed).toBe(1);
		await instrument(instrumentation())();
	});

	it('disposes all owned instrumentation when one disposer fails', async () => {
		const owner = createInstrumentationOwner();
		const disposed: string[] = [];
		runWithInstrumentationOwner(owner, () => {
			instrument({
				...instrumentation(Symbol('first')),
				dispose() {
					disposed.push('first');
					throw new Error('failed');
				},
			});
			instrument({
				...instrumentation(Symbol('second')),
				dispose() {
					disposed.push('second');
				},
			});
		});

		await expect(owner.dispose()).rejects.toThrow('failed');
		expect(disposed).toEqual(['second', 'first']);
	});
});
