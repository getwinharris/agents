import { dispatch, invoke } from '@bapX/runtime';
import { bapX } from '@bapX/runtime/routing';
import { Cron } from 'croner';
import { Hono } from 'hono';
import scheduledAgent from './agents/scheduled.ts';
import scheduledWorkflow from './workflows/scheduled.ts';

const app = new Hono();
app.route('/', bapX());

new Cron(
	process.env.AGENT_SCHEDULE ?? '0 9 * * *',
	{
		protect: true,
		timezone: process.env.SCHEDULE_TIMEZONE ?? 'UTC',
		catch: (error) => console.error('Scheduled agent admission failed', error),
	},
	async () => {
		await dispatch(scheduledAgent, {
			id: 'daily-summary',
			message: {
				kind: 'signal',
				type: 'schedule',
				body: 'Review recent activity and prepare the daily summary.',
				attributes: { scheduledAt: new Date().toISOString() },
			},
		});
	},
);

new Cron(
	process.env.WORKFLOW_SCHEDULE ?? '0 10 * * *',
	{
		protect: true,
		timezone: process.env.SCHEDULE_TIMEZONE ?? 'UTC',
		catch: (error) => console.error('Scheduled workflow admission failed', error),
	},
	async () => {
		await invoke(scheduledWorkflow, {
			input: {
				prompt: 'Review recent activity and return the daily summary.',
				scheduledAt: new Date().toISOString(),
			},
		});
	},
);

export default app;
