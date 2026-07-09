import type { LlmAssistantMessage, LlmMessage, LlmTool } from '@bapX/runtime';

export type GenAIContent = unknown[];

export function inputMessages(messages: LlmMessage[]): GenAIContent {
	return messages.map((message) => {
		if (message.role === 'user') {
			return { role: 'user', parts: parts(message.content) };
		}
		if (message.role === 'assistant') {
			return { role: 'assistant', parts: parts(message.content) };
		}
		return {
			role: 'tool',
			parts: [
				{
					type: 'tool_call_response',
					id: message.toolCallId,
					response: contentValue(message.content),
				},
			],
		};
	});
}

export function outputMessages(
	message: LlmAssistantMessage | undefined,
	finishReason: string | undefined,
): GenAIContent | undefined {
	if (!message || !finishReason) return undefined;
	return [{
		role: 'assistant',
		parts: parts(message.content),
		...(finishReason ? { finish_reason: normalizeFinishReason(finishReason) } : {}),
	}];
}

export function agentInputMessage(
	input: { text: string; images?: Array<{ mimeType: string }> } | undefined,
): GenAIContent | undefined {
	if (!input) return undefined;
	return [{ role: 'user', parts: [{ type: 'text', content: input.text }] }];
}

export function agentOutputMessage(
	output: { type: 'text'; text: string; finishReason: string } | { type: 'data'; data: unknown } | undefined,
): GenAIContent | undefined {
	if (!output || output.type !== 'text') return undefined;
	return [{
		role: 'assistant',
		parts: [{ type: 'text', content: output.text }],
		finish_reason: normalizeFinishReason(output.finishReason),
	}];
}

export function systemInstructions(value: string | undefined): GenAIContent | undefined {
	return value === undefined ? undefined : [{ type: 'text', content: value }];
}

export function toolDefinitions(tools: LlmTool[] | undefined): GenAIContent | undefined {
	if (!tools) return undefined;
	return tools.map((tool) => ({
		type: 'function',
		name: tool.name,
		...(tool.description ? { description: tool.description } : {}),
		...(tool.parameters === undefined ? {} : { parameters: tool.parameters }),
	}));
}

function parts(content: string | Array<Record<string, unknown>>): unknown[] {
	if (typeof content === 'string') return [{ type: 'text', content }];
	return content.flatMap<unknown>((part) => {
		if (part.type === 'text') return [{ type: 'text', content: part.text }];
		if (part.type === 'thinking') return [{ type: 'reasoning', content: part.thinking }];
		if (part.type === 'toolCall') {
			return [{ type: 'tool_call', id: part.id, name: part.name, arguments: part.arguments }];
		}
		return [];
	});
}

function contentValue(content: Array<Record<string, unknown>>): unknown {
	if (content.length === 1 && content[0]?.type === 'text') return content[0].text;
	return content.flatMap((part) => (part.type === 'text' ? [part.text] : []));
}

function normalizeFinishReason(reason: string): string {
	if (reason === 'toolUse') return 'tool_call';
	if (reason === 'aborted') return 'error';
	return reason;
}
