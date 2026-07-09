import { AsyncLocalStorage } from 'node:async_hooks';
import { InstrumentationAlreadyInstalledError } from './errors.ts';
import type { BapxExecutionInterceptor } from './execution-interceptor.ts';
import { registerExecutionInterceptor } from './execution-interceptor.ts';
import type { BapxObservationSubscriber } from './observation.ts';
import { observe } from './runtime/events.ts';

export interface BapxInstrumentation {
	key?: symbol;
	observe: BapxObservationSubscriber;
	interceptor: BapxExecutionInterceptor;
	dispose(): void | Promise<void>;
}

const installed = new WeakMap<object, () => Promise<void>>();
const installedKeys = new Map<symbol, object>();
interface InstrumentationOwnerRegistration extends InstrumentationOwner {
	add(dispose: () => Promise<void>): void;
}

const ownerStorage = new AsyncLocalStorage<InstrumentationOwnerRegistration>();

export interface InstrumentationOwner {
	dispose(): Promise<void>;
}

export function createInstrumentationOwner(): InstrumentationOwner {
	const disposers = new Set<() => Promise<void>>();
	let disposePromise: Promise<void> | undefined;
	let disposed = false;
	const owner: InstrumentationOwnerRegistration = {
		dispose() {
			disposed = true;
			disposePromise ??= Promise.allSettled([...disposers].reverse().map((dispose) => dispose())).then(
				(results) => {
					const errors = results
						.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
						.map((result) => result.reason);
					if (errors.length === 1) throw errors[0];
					if (errors.length > 1) {
						throw new AggregateError(errors, '[bapX] Instrumentation disposal failed.');
					}
				},
			);
			return disposePromise;
		},
		add(dispose) {
			if (disposed) {
				void dispose().catch(() => undefined);
				return;
			}
			disposers.add(dispose);
		},
	};
	return owner;
}

export function runWithInstrumentationOwner<T>(owner: InstrumentationOwner, fn: () => T): T {
	return ownerStorage.run(owner as InstrumentationOwnerRegistration, fn);
}

export function instrument(instrumentation: BapxInstrumentation): () => Promise<void> {
	const existing = installed.get(instrumentation);
	if (existing) return existing;
	const key = instrumentation.key;
	if (key && installedKeys.has(key)) throw new InstrumentationAlreadyInstalledError();
	if (key) installedKeys.set(key, instrumentation);
	let stopObserving: () => void;
	let stopIntercepting: () => void;
	try {
		stopObserving = observe(instrumentation.observe);
		stopIntercepting = registerExecutionInterceptor(instrumentation.interceptor);
	} catch (error) {
		if (key) installedKeys.delete(key);
		throw error;
	}
	let disposePromise: Promise<void> | undefined;
	const dispose = (): Promise<void> => {
		disposePromise ??= Promise.resolve().then(async () => {
			stopObserving();
			stopIntercepting();
			try {
				await instrumentation.dispose();
			} finally {
				installed.delete(instrumentation);
				if (key && installedKeys.get(key) === instrumentation) installedKeys.delete(key);
			}
		});
		return disposePromise;
	};
	installed.set(instrumentation, dispose);
	ownerStorage.getStore()?.add(dispose);
	return dispose;
}
