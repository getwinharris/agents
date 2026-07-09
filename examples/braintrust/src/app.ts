import { type FlueObservation, observe } from '@bapX/runtime';
import { flue } from '@bapX/runtime/routing';
import { braintrustFlueObserver, initLogger } from 'braintrust';
import { Hono } from 'hono';

const apiKey = process.env.BRAINTRUST_API_KEY;
const observedRuns = new Set<string>();

if (apiKey) {
	initLogger({
		projectName: process.env.BRAINTRUST_PROJECT_NAME ?? 'Flue',
		apiKey,
	});

	observe((event, ctx) => {
		const compatible = compatibleEvent(event);
		if (compatible) braintrustFlueObserver(compatible, ctx);
	});
}

function compatibleEvent(event: FlueObservation): unknown {
	if (event.type === 'run_start') {
		observedRuns.add(event.runId);
		return event;
	}
	if (event.type === 'run_end') {
		observedRuns.delete(event.runId);
		return event;
	}
	if (event.type === 'tool') return { ...event, type: 'tool_call' };
	if (event.type === 'run_resume') {
		if (observedRuns.has(event.runId)) return event;
		observedRuns.add(event.runId);
		return { ...event, type: 'run_start', input: undefined, payload: undefined };
	}
	if (
		event.type === 'operation_start' ||
		event.type === 'operation' ||
		event.type === 'turn_request' ||
		event.type === 'turn' ||
		event.type === 'tool_start' ||
		event.type === 'task_start' ||
		event.type === 'task' ||
		event.type === 'compaction_start' ||
		event.type === 'compaction'
	) {
		return event;
	}
	return undefined;
}

const app = new Hono();
app.route('/', flue());

export default app;
