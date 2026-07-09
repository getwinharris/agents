import {
	defineAgent,
	defineWorkflow,
	type WorkflowRouteHandler,
	type WorkflowRunsHandler,
} from '@bapX/runtime';

export const route: WorkflowRouteHandler = async (_c, next) => next();
export const runs: WorkflowRunsHandler = async (_c, next) => next();
const agent = defineAgent(() => ({ model: 'anthropic/claude-haiku-4-5' }));
export default defineWorkflow({
	agent,
	async run({ log }) {
		try {
			throw new TypeError('downstream service returned an unexpected shape');
		} catch (error) {
			log.error('flaky downstream call failed; continuing with fallback', {
				error,
				service: 'fictional-pricing-api',
				retriable: false,
			});
		}
		log.error('low-confidence model output rejected', {
			confidence: 0.21,
			threshold: 0.5,
			action: 'fell back to deterministic path',
		});
		return { ok: true, fallbackUsed: true };
	},
});
