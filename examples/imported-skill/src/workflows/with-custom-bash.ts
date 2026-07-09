import { bash, defineAgent, defineWorkflow, type WorkflowRouteHandler } from '@bapX/runtime';
import { Bash, InMemoryFs } from 'just-bash';

export const route: WorkflowRouteHandler = async (_c, next) => next();
const agent = defineAgent(() => {
	const fs = new InMemoryFs();
	return { sandbox: bash(() => new Bash({ fs })), model: 'anthropic/claude-haiku-4-5' };
});

export default defineWorkflow({
	agent,
	async run({ harness }) {
		const session = await harness.session();
		await session.shell('echo "custom bash succeeded" > proof.txt');
		return { text: (await session.shell('cat proof.txt')).stdout.trim() };
	},
});
