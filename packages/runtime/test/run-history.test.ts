import { Hono } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';

import { InMemoryRunStore } from '../src/node/run-store.ts';
import { bapX } from '../src/routing.ts';
import { configureBapxRuntime, resetBapxRuntimeForTests } from '../src/runtime/bapX-app.ts';
import { nodeRuntime } from './helpers/runtime-config.ts';
import type { RunStore } from '../src/runtime/run-store.ts';

afterEach(() => {
	resetBapxRuntimeForTests();
});

function createRunApp(runStore: RunStore) {
	configureBapxRuntime(nodeRuntime({ runStore }));
	const app = new Hono();
	app.route('/', bapX());
	return app;
}

describe('workflow run routes', () => {
	it('returns 404 for a stream that does not exist when GET /runs/:runId is requested', async () => {
		const store: RunStore = new InMemoryRunStore();
		const app = createRunApp(store);

		const response = await app.fetch(new Request('http://localhost/runs/run_01MISSING'));

		expect(response.status).toBe(404);
	});
});
