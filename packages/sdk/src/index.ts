export type {
	CreateFlueClientOptions,
	FlueClient,
	HttpClientOptions,
	RequestHeaders,
	RunEventsOptions,
	WorkflowInvokeOptions,
	WorkflowInvokeResult,
} from './client.ts';
export { createFlueClient } from './client.ts';
export { FlueApiError } from './http.ts';
export type {
	AgentPromptImage,
	AgentPromptOptions,
	AgentPromptResult,
	AgentSendResult,
} from './public/invoke.ts';
// Stream errors surfaced by `stream()`/`events()` iteration. These classes
// are owned by @durable-streams/client; only the ones reachable through SDK
// reads are re-exported.
export {
	DurableStreamError,
	FetchBackoffAbortError,
	FetchError,
	StreamClosedError,
} from '@durable-streams/client';
export type { BackoffOptions, LiveMode } from '@durable-streams/client';
export type {
	FlueEventStream,
	FlueStreamOptions,
} from './public/stream.ts';
export type {
	AttachedAgentEvent,
	FlueEvent,
	FluePublicError,
	LlmAssistantMessage,
	LlmTextContent,
	LlmThinkingContent,
	LlmToolCall,
	LlmTurnPurpose,
	RunRecord,
	RunStatus,
} from './types.ts';
