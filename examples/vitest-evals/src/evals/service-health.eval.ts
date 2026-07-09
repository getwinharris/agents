import { expect } from 'vitest';
import { describeEval, toolCalls } from 'vitest-evals';
import { createBapxAgentHarness } from './harness.ts';

const harness = createBapxAgentHarness({ agentName: 'service-status' });

describeEval('Bapx service status agent', { harness }, (it) => {
	it('checks live service status before answering', async ({ run }) => {
		const result = await run('Is the checkout service currently operational?');

		expect(result.output).toContain('operational');
		expect(toolCalls(result).map((call) => call.name)).toContain('get_service_status');
		expect(result.usage.totalTokens).toBeGreaterThan(0);
	});
});
