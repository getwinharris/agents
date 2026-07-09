import { fauxAssistantMessage, fauxText, registerFauxProvider } from '@earendil-works/pi-ai/compat';
import { type AgentRouteHandler, defineAgent } from '@bapX/runtime';

// Opt this agent into HTTP transport so the built demo server serves it at
// `/api/agents/assistant/:id`. Without an exported `route` the agent is private
// in production (only `flue dev`'s temporary local exposure would reach it).
export const route: AgentRouteHandler = async (_c, next) => next();

export default defineAgent(() => {
	const faux = registerFauxProvider({
		api: 'react-chat-example',
		provider: 'react-chat-example',
		models: [{ id: 'assistant' }],
	});
	faux.setResponses([
		(context) => {
			const input = context.messages.at(-1);
			const text =
				input?.role === 'user'
					? typeof input.content === 'string'
						? input.content
						: input.content.map((block) => (block.type === 'text' ? block.text : '')).join('')
					: '';
			return fauxAssistantMessage(fauxText(`You said: ${text}`));
		},
	]);
	return {
		model: 'react-chat-example/assistant',
		instructions: 'Reply briefly and helpfully.',
	};
});
