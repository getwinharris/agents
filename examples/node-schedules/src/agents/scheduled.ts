import { defineAgent, defineAgentProfile } from '@bapX/runtime';

const scheduledAgent = defineAgentProfile({
	instructions: 'Complete scheduled tasks autonomously.',
});

export default defineAgent(() => ({ profile: scheduledAgent }));
