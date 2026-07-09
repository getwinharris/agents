export type { BackoffOptions, LiveMode } from '@durable-streams/client';
// Stream errors surfaced by `stream()`/`events()` iteration. These classes
// are owned by @durable-streams/client; only the ones reachable through SDK
// reads are re-exported.
export {
	DurableStreamError,
	FetchBackoffAbortError,
	FetchError,
	StreamClosedError,
} from '@durable-streams/client';
export type {
	AgentAbortResult,
	CreateBapxClientOptions,
	BapxClient,
	HttpClientOptions,
	RequestHeaders,
	RunEventsOptions,
	WorkflowInvokeOptions,
	WorkflowInvokeResult,
	WorkflowWaitResult,
} from './client.ts';
export { createBapxClient } from './client.ts';
export { BapxApiError } from './http.ts';
export type {
	BapxConversationHistoryOptions,
	BapxConversationMessage,
	BapxConversationPart,
	BapxConversationSettlement,
	BapxConversationSnapshot,
	BapxConversationState,
} from './public/conversation.ts';
export type {
	AgentConversationObservation,
	AgentConversationObservationPhase,
	AgentConversationObservationSnapshot,
	AgentConversationObserveOptions,
	ConversationLiveMode,
} from './public/observe.ts';
// The conversation `updates` wire union is not stable application API, but
// first-party presenters (CLI, dev console) reduce it directly, so the type is
// exported for them. Application code should consume materialized
// `BapxConversationState` via `observe()` rather than handling chunks.
export type { ConversationStreamChunk } from './public/conversation-stream.ts';
export type {
	AgentPromptOptions,
	AgentSendResult,
	DeliveredAttachment,
	DeliveredMessage,
} from './public/invoke.ts';
export {
	type AgentWaitOptions,
	BapxExecutionError,
	type BapxExecutionFailure,
	type BapxExecutionTarget,
	type WorkflowRunOptions,
	type WorkflowRunResult,
} from './public/settle.ts';
export type { BapxEventStream, BapxStreamOptions } from './public/stream.ts';
export { UnsupportedBapxEventVersionError } from './public/stream.ts';
export type {
	AgentSubmissionSettledEvent,
	AttachedAgentEvent,
	BapxEvent,
	BapxPublicError,
	BapxSerializedError,
	LlmAssistantMessage,
	LlmImageContent,
	LlmMessage,
	LlmTextContent,
	LlmThinkingContent,
	LlmToolCall,
	LlmToolResultMessage,
	LlmTurnPurpose,
	LlmUserMessage,
	ModelRequest,
	ModelRequestInfo,
	ModelRequestInput,
	ModelResponse,
	PromptUsage,
	RunRecord,
	RunStatus,
} from './types.ts';
export { IMAGE_DATA_OMITTED } from './types.ts';
