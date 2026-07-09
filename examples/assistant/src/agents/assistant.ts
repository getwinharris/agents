import { getSandbox } from '@cloudflare/sandbox';
import { type AgentRouteHandler, defineAgent, defineAgentProfile } from '@bapX/runtime';
import { cloudflareSandbox } from '@bapX/runtime/cloudflare';

interface Env {
	Sandbox: Parameters<typeof getSandbox>[0];
}

export const route: AgentRouteHandler = async (_c, next) => next();

const assistant = defineAgentProfile({
	instructions: 'You complete task requests submitted directly to this agent.',
});

export default defineAgent<Env>(({ id, env }) => ({
	profile: assistant,
	sandbox: cloudflareSandbox(getSandbox(env.Sandbox, id)),
}));
