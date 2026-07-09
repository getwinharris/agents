// flue-blueprint: tooling/vitest-evals@1
import { createFlueClient, type FlueConversationMessage } from '@bapX/sdk';
import { createHarness, type SimpleToolCallRecord } from 'vitest-evals';

export interface FlueAgentHarnessOptions {
	agentName: string;
	baseUrl?: string;
	token?: string;
	headers?: Record<string, string>;
}

function lastAssistantMessage(
	messages: FlueConversationMessage[],
): FlueConversationMessage | undefined {
	return messages.findLast((entry) => entry.role === 'assistant');
}

function messageText(message: FlueConversationMessage | undefined): string {
	if (!message) return '';
	return message.parts
		.filter((part) => part.type === 'text')
		.map((part) => part.text)
		.join('');
}

function collectToolCalls(messages: FlueConversationMessage[]): SimpleToolCallRecord[] {
	return messages.flatMap((message) =>
		message.parts.flatMap((part) => {
			if (part.type !== 'dynamic-tool') return [];
			return [
				{
					id: part.toolCallId,
					name: part.toolName,
					arguments: part.input,
					...(part.state === 'output-error'
						? { error: part.errorText }
						: part.state === 'output-available'
							? { result: part.output }
							: {}),
				},
			];
		}),
	);
}

export function createFlueAgentHarness(options: FlueAgentHarnessOptions) {
	const client = createFlueClient({
		baseUrl: options.baseUrl ?? process.env.FLUE_BASE_URL ?? 'http://127.0.0.1:3583',
		token: options.token,
		headers: options.headers,
	});

	return createHarness<string, string>({
		name: `flue-${options.agentName}-agent`,
		run: async ({ input, signal }) => {
			const instanceId = `eval-${crypto.randomUUID()}`;
			const admission = await client.agents.send(options.agentName, instanceId, {
				message: { kind: 'user', body: input },
				signal,
			});
			await client.agents.wait(admission, { signal });
			const history = await client.agents.history(options.agentName, instanceId, { signal });
			const reply = lastAssistantMessage(history.messages);
			const usage = reply?.metadata?.usage;
			const model = reply?.metadata?.model;

			return {
				output: messageText(reply),
				toolCalls: collectToolCalls(history.messages),
				// The reply's own message metadata carries usage/model — the same
				// data the removed prompt-result surface used to return.
				...((usage ?? model)
					? {
							usage: {
								...(model ? { provider: model.provider, model: model.id } : {}),
								...(usage
									? {
											inputTokens: usage.input,
											outputTokens: usage.output,
											totalTokens: usage.totalTokens,
											metadata: { cost: usage.cost.total },
										}
									: {}),
							},
						}
					: {}),
			};
		},
	});
}
