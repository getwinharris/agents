/**
 * Internal runtime helpers consumed by the generated server entry point.
 *
 * This subpath is NOT part of the public API. It exists solely so the build
 * plugins (Node, Cloudflare) can emit stable bare-specifier imports that
 * resolve through normal package-exports resolution at both build time and
 * runtime, for both workspace-linked and published-npm installs.
 *
 * User agent code should never import from here.
 */
import { type Api, getModel, type KnownProvider, type Model } from '@earendil-works/pi-ai/compat';

export { Bash, InMemoryFs } from 'just-bash';

import { resolveRegisteredModel } from './runtime/providers.ts';

export type {
	AgentDispatchAdmission,
	AgentDispatchReceipt,
	AgentExecutionStore,
	AgentSubmission,
	AgentSubmissionStore,
	PersistenceAdapter,
	SubmissionAttemptRef,
	SubmissionDurability,
	SubmissionSettlementObligation,
} from './agent-execution-store.ts';
export type { BapxContextConfig, BapxContextInternal } from './client.ts';
export { createBapxContext, initializeRootHarness } from './client.ts';
// `BapxRegistry` (Durable Object class) and the composite Cloudflare run
// store/index factories live in the `@bapX/runtime/cloudflare/internal`
// subpath because that entry pulls in `cloudflare:workers`, a virtual module
// Node can't resolve. The generated CF entry imports them from there
// directly; nothing here may import `cloudflare:workers`.
export {
	CLOUDFLARE_AGENT_INTERNAL_DISPATCH_PATH,
	createCloudflareAgentRuntime,
} from './cloudflare/agent-coordinator.ts';
export { createSqlConversationStores } from './cloudflare/agent-execution-store.ts';
// Conversation wire types projected onto the HTTP `history`/`updates` views.
// Exposed here only so the SDK can pin its public projection types to the
// runtime's emitted shapes via a compile-time assignability test.
export type {
	AgentConversationSnapshot,
	ConversationStreamChunk,
} from './conversation-public.ts';
export { RuntimeUnavailableError, toHttpResponse } from './errors.ts';
export type { InstrumentationOwner } from './instrumentation.ts';
export {
	createInstrumentationOwner,
	runWithInstrumentationOwner,
} from './instrumentation.ts';
export { createNodeAgentCoordinator, createNodeDispatchQueue } from './node/agent-coordinator.ts';
export { InMemoryRunStore } from './node/run-store.ts';
export type { AgentSubmissionInput } from './runtime/agent-submissions.ts';
export type { AttachmentStore } from './runtime/attachment-store.ts';
export { InMemoryAttachmentStore } from './runtime/attachment-store.ts';
export type { ConversationStreamStore } from './runtime/conversation-stream-store.ts';
export {
	InMemoryConversationStreamStore,
	SqliteConversationStreamStore,
} from './runtime/conversation-stream-store.ts';
export type { AgentInteractionStart } from './runtime/dev-lifecycle-logger.ts';
export { installDevLifecycleLogger } from './runtime/dev-lifecycle-logger.ts';
export type { DispatchInput, DispatchQueue } from './runtime/dispatch-queue.ts';
export type { EventStreamStore } from './runtime/event-stream-store.ts';
export { SqliteEventStreamStore } from './runtime/event-stream-store.ts';
export type {
	AgentRecord,
	CloudflareRuntime,
	BapxRuntime,
	HandleRunRouteOptions,
	NodeRuntime,
	WorkflowRecord,
} from './runtime/bapX-app.ts';
export {
	configureBapxRuntime,
	createDefaultBapxApp,
	handleRunRouteRequest,
} from './runtime/bapX-app.ts';
export type {
	AdmitDetachedWorkflowOptions,
	CreateAgentContextFn,
	CreateAgentContextOptions,
	CreateWorkflowContextFn,
	CreateWorkflowContextOptions,
	FailRecoveredRunOptions,
	HandleAgentOptions,
	HandleWorkflowOptions,
	InvokeWorkflowAttachedOptions,
	StartWorkflowAdmissionFn,
	WorkflowAttachedInvocationResult,
	WorkflowSchedulingPhases,
} from './runtime/handle-agent.ts';
// Runtime modules consumed by the generated server entries.
//
//   - `configureBapxRuntime` seeds the module-scoped config that
//     `bapX()` reads at request time. Called once per generated entry,
//     before the listener (Node) or `default.fetch` (Cloudflare) takes
//     traffic.
//
//   - `createDefaultBapxApp` is the no-`app.ts` fallback. Lives in
//     @bapX/runtime so the generated entry doesn't have to import `hono` (which
//     keeps user projects from needing it as a direct dep when they
//     don't author their own `app.ts`).
//
// The user-facing `bapX()` itself is re-exported from `@bapX/runtime/routing`, not here.
export {
	admitDetachedWorkflow,
	assertWorkflowDefinition,
	failRecoveredRun,
	handleWorkflowRequest,
	invokeWorkflowAttached,
} from './runtime/handle-agent.ts';
export {
	handleAgentConversationHead,
	handleAgentConversationRead,
} from './runtime/handle-conversation-routes.ts';
export { handleStreamHead, handleStreamRead } from './runtime/handle-stream-routes.ts';
export { generateWorkflowRunId } from './runtime/ids.ts';
export { hasRegisteredProvider, resetProviderRuntime } from './runtime/providers.ts';
export type {
	ListRunsOpts,
	ListRunsResponse,
	RunPointer,
	RunRecord,
	RunStatus,
	RunStore,
	WorkflowRunPointer,
} from './runtime/run-store.ts';
export type {
	RuntimeActivityGate,
	RuntimeActivityLease,
} from './runtime/runtime-activity-gate.ts';
export { createRuntimeActivityGate } from './runtime/runtime-activity-gate.ts';

export { bashFactoryToSessionEnv } from './sandbox.ts';
export { parseSkillMarkdown } from './skill-frontmatter.ts';
export { buildPackagedSkill, createSkillReference } from './skill-package.ts';
export { createSqlRunStore } from './sql-run-store.ts';

/**
 * Resolve a `provider-id/model-id` model specifier to a pi-ai Model.
 * Registered provider IDs win over pi-ai's catalog; registrations for
 * catalog provider IDs hydrate metadata from the catalog with the
 * registration's options layered on top.
 */
export function resolveModel(model: string): Model<Api> {
	const modelSpecifier = model;

	const slash = modelSpecifier.indexOf('/');
	if (slash === -1) {
		throw new Error(
			`[bapX] Invalid model specifier "${modelSpecifier}". ` +
				`Use the "provider-id/model-id" format (e.g. "anthropic/claude-haiku-4-5").`,
		);
	}
	const providerId = modelSpecifier.slice(0, slash);
	const modelId = modelSpecifier.slice(slash + 1);

	const registered = resolveRegisteredModel(providerId, modelId);
	if (registered) {
		if (modelId === '') {
			throw new Error(
				`[bapX] Invalid model specifier "${modelSpecifier}". ` +
					`Provider ID "${providerId}" is registered via registerProvider(), but no model ID ` +
					`was given. Use "${providerId}/<model-id>".`,
			);
		}
		return registered;
	}

	// `getModel` is typed for literal model IDs; runtime strings are checked by
	// the null return below.
	const resolved = getModel(providerId as KnownProvider, modelId as never);
	if (!resolved) {
		throw new Error(
			`[bapX] Unknown model specifier "${modelSpecifier}". ` +
				`Provider ID "${providerId}" / model ID "${modelId}" ` +
				`is not registered with @earendil-works/pi-ai or via registerProvider().`,
		);
	}
	return resolved;
}
