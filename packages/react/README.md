# `@bapX/react`

React hooks for live Bapx agent conversations and workflow runs. `@bapX/react` manages UI state; `@bapX/sdk` handles HTTP and Durable Streams transport.

```sh
npm install @bapX/react @bapX/sdk
```

Requires React 18 or later. For examples, see the [React guide](https://docs.bapx.in/guide/react/). Relative `baseUrl` values such as `/api` require a browser; use an absolute URL when creating the client during SSR.

## Setup

```tsx
import { BapxProvider } from '@bapX/react';
import { createBapxClient } from '@bapX/sdk';

const client = createBapxClient({ baseUrl: '/api' });

export function Root() {
  return (
    <BapxProvider client={client}>
      <App />
    </BapxProvider>
  );
}
```

### `BapxProvider`

```ts
interface BapxProviderProps {
  client: BapxClient;
  children?: ReactNode;
}
```

Provides an application-created SDK client to descendant hooks. Configure authentication, headers, and custom `fetch` behavior on that client.

### `useBapxClient()`

```ts
function useBapxClient(): BapxClient;
```

Returns the nearest provider's client and throws if no provider exists. The hooks also accept a `client` option instead of a provider; a client is required even while a hook is dormant.

## `useBapxAgent()`

```ts
function useBapxAgent(options: UseBapxAgentOptions): UseBapxAgentResult;

interface UseBapxAgentOptions {
  name: string;
  id?: string;
  history?: number | 'all';
  live?: 'sse' | 'long-poll';
  client?: BapxClient;
}
```

Connects to one persistent agent instance, reconstructs its transcript, and follows new events.

| Option    | Description                                                                    |
| --------- | ------------------------------------------------------------------------------ |
| `name`    | Agent module name.                                                             |
| `id`      | Agent instance ID. Omit to keep the hook dormant.                              |
| `history` | Positive integer event limit. Defaults to `100`; use `'all'` for full history. |
| `live`    | Live stream mode. Defaults to `'sse'`; use `'long-poll'` to disable SSE.        |
| `client`  | SDK client override.                                                           |

```ts
interface UseBapxAgentResult {
  messages: UIMessage[];
  status: AgentStatus;
  historyReady: boolean;
  error: Error | undefined;
  sendMessage(message: string, options?: SendMessageOptions): Promise<void>;
}

interface SendMessageOptions {
  images?: AgentPromptImage[];
}

type AgentStatus = 'idle' | 'connecting' | 'submitted' | 'streaming' | 'error';
```

| Status       | Meaning                                                                  |
| ------------ | ------------------------------------------------------------------------ |
| `idle`       | No local prompt is active, or a new instance has no stream.              |
| `connecting` | Initial connection or retry. `error` holds the latest retryable failure. |
| `submitted`  | A prompt is being admitted or awaits attributable assistant activity.    |
| `streaming`  | Assistant activity for this client's submission is arriving.             |
| `error`      | Prompt admission or stream observation failed terminally.                |

### `sendMessage()`

Adds an optimistic user message, calls `client.agents.send()`, and resolves when the server admits the prompt. It does not wait for generation. If admission fails, the hook removes the optimistic message, sets `error`, and rejects the promise. Calling it without an `id` rejects.

The admission receipt reconciles the optimistic message with its durable stream copy. Concurrent sends use the runtime's per-session queue.

The hook loads the requested durable history before publishing it, sets `historyReady` to `true`, and then follows live events from the exact completed-history checkpoint. Consumers receive one coherent initial transcript instead of progressively reordered history batches. `historyReady` remains `true` through later reconnects.

A new agent instance has no stream until its first prompt is admitted. The hook treats the initial `404` as an empty conversation and attaches after its first successful send. Transient failures retry from the delivered checkpoint with capped exponential backoff, and `sendMessage()` wakes a pending retry.

The hook has no `stop()` method because ending browser observation does not cancel server work.

## Messages

`UIMessage` mirrors the AI SDK v5 data shape without a runtime dependency on `ai`. This compatibility does not include the AI SDK transport protocol.

```ts
interface UIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  metadata?: {
    usage?: PromptUsage;
    model?: { provider: string; id: string };
    [key: string]: unknown;
  };
  parts: UIMessagePart[];
}

type UIMessagePart =
  | { type: 'text'; text: string; state?: 'streaming' | 'done' }
  | { type: 'reasoning'; text: string; state?: 'streaming' | 'done' }
  | {
      type: 'dynamic-tool';
      toolName: string;
      toolCallId: string;
      state: 'input-available';
      input: unknown;
    }
  | {
      type: 'dynamic-tool';
      toolName: string;
      toolCallId: string;
      state: 'output-available';
      input: unknown;
      output: unknown;
    }
  | {
      type: 'dynamic-tool';
      toolName: string;
      toolCallId: string;
      state: 'output-error';
      input: unknown;
      errorText: string;
    }
  | { type: 'file'; mediaType: string; url: string }
  | { type: `data-${string}`; id?: string; data: unknown };
```

Runtime `data` events become standalone `data-*` message parts. Repeated events with the same `(name, id)` replace their first timeline entry in place; events without ids remain distinct. Use `history: 'all'` when full lifecycle reconstruction is required.

Streaming deltas provide best-effort live text and reasoning progress; `message_end` is the authoritative completed assistant message. A hook that attaches after generation starts may miss earlier partial output until `message_end` arrives. This does not affect the runtime's internal interrupted-turn recovery. Tool calls progress from input to output or error; tool input arrives complete, so there is no `input-streaming` state.

Durable events omit image bytes, so replayed file parts contain a non-renderable redaction sentinel in `url`. Images sent by the current client retain their usable data URLs when reconciled. Message IDs remain stable across replay: assistant IDs derive from `turnId`, and direct user IDs from `submissionId`.

## `useBapxWorkflow()`

```ts
function useBapxWorkflow(options: UseBapxWorkflowOptions): UseBapxWorkflowResult;

interface UseBapxWorkflowOptions {
  runId?: string;
  client?: BapxClient;
}
```

Replays and follows one workflow run. Invoke the workflow separately through `useBapxClient()` or another SDK client.

| Option   | Description                                     |
| -------- | ----------------------------------------------- |
| `runId`  | Workflow run ID. Omit to keep the hook dormant. |
| `client` | SDK client override.                            |

```ts
interface UseBapxWorkflowResult {
  events: BapxEvent[];
  logs: Extract<BapxEvent, { type: 'log' }>[];
  status: WorkflowStatus;
  result: unknown;
  error: unknown;
}

type WorkflowStatus = 'idle' | 'connecting' | 'running' | 'completed' | 'errored' | 'disconnected';
```

The hook replays the complete bounded run stream. `events` is uncapped, `logs` contains its log events, and `result` and workflow errors come from `run_end`. A successful run without a result returns `null`.

| Status         | Meaning                                                                            |
| -------------- | ---------------------------------------------------------------------------------- |
| `idle`         | No `runId` is present.                                                             |
| `connecting`   | Initial connection or retry. `error` holds the latest retryable transport failure. |
| `running`      | A `run_start` or `run_resume` event was observed.                                  |
| `completed`    | `run_end` reported success.                                                        |
| `errored`      | `run_end` reported a workflow failure.                                             |
| `disconnected` | Observation ended without `run_end` and will not retry.                            |

Transient failures remain `connecting` and retry from the durable checkpoint. `401`, `403`, `404`, and stream closure without `run_end` become `disconnected`. Completed and errored runs are terminal.

## SSR and lifecycle

Hooks return empty, idle server snapshots and connect only after React commits in the browser. React Strict Mode effect replay is supported.

Changing the client, agent name, agent ID, history, live stream mode, or workflow run ID replaces the current observer. Unmounting stops local observation but not server-side work.

## Re-exported types

`@bapX/react` re-exports these SDK types:

- `AgentPromptImage`
- `AttachedAgentEvent`
- `BapxEvent`
- `PromptUsage`
