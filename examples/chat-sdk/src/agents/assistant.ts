import {
	fauxAssistantMessage,
	fauxText,
	fauxToolCall,
	registerFauxProvider,
} from '@earendil-works/pi-ai/compat';
import { defineAgent, defineTool } from '@bapX/runtime';
import * as v from 'valibot';
import { bot } from '../chat.ts';

export default defineAgent(() => {
	const faux = registerFauxProvider({
		api: 'chat-sdk-example',
		provider: 'chat-sdk-example',
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
			const threadId = /"threadId"\s*:\s*"([^"]+)"/.exec(text)?.[1] ?? '';
			return fauxAssistantMessage(
				fauxToolCall('reply_to_chat_thread', {
					threadId,
					text: 'Reply from a Bapx agent through Chat SDK.',
				}),
				{ stopReason: 'toolUse' },
			);
		},
		fauxAssistantMessage(fauxText('Reply sent.')),
	]);
	return {
		model: 'chat-sdk-example/assistant',
		instructions:
			'When receiving a chat message, use reply_to_chat_thread to reply in the supplied thread.',
		tools: [
			defineTool({
				name: 'reply_to_chat_thread',
				description: 'Post a response into the originating Chat SDK thread.',
				input: v.object({
					threadId: v.string(),
					text: v.string(),
				}),
				async run({ input }) {
					await bot.thread(input.threadId).post(input.text);
					return 'Reply sent.';
				},
			}),
		],
	};
});
