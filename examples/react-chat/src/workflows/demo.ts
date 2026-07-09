import {
	defineAgent,
	defineWorkflow,
	type WorkflowRouteHandler,
	type WorkflowRunsHandler,
} from '@bapX/runtime';
import * as v from 'valibot';

export const route: WorkflowRouteHandler = async (_c, next) => next();
export const runs: WorkflowRunsHandler = async (_c, next) => next();

const agent = defineAgent(() => ({ model: 'anthropic/claude-haiku-4-5' }));
export default defineWorkflow({
	agent,
	input: v.object({ requestedAt: v.string() }),
	async run({ log, input }) {
		log.info('workflow started', { requestedAt: input.requestedAt });
		await new Promise((resolve) => setTimeout(resolve, 500));
		log.info('workflow received input', { input });
		await new Promise((resolve) => setTimeout(resolve, 500));
		log.info('workflow completed');
		return { ok: true, requestedAt: input.requestedAt };
	},
});
