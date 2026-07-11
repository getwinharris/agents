---
title: client.agents
description: Invoke persistent agent instances and read their conversations.
---

Direct agent APIs interact with persistent agent instances by agent name and instance id, addressing that instance's default conversation. Direct agent interactions do not create workflow runs and do not emit `runId`.

## `client.agents.send(...)`

```ts
send(name: string, id: string, options: AgentPromptOptions): Promise<AgentSendResult>;
```

Delivers one message to a persistent agent instance and resolves as soon as the submission is durably admitted — it does **not** wait for the agent to respond. This uses `POST /agents/:name/:id`, which returns `202`.

Agent messages are fire-and-forget: a message is delivered into the instance's living conversation and has no single terminal "result" value to return. To await completion, pass the result to `agents.wait()`; to read the agent's reply, observe the conversation with `agents.observe()` or read `agents.history()`.

### `AgentPromptOptions`

| Field     | Type               | Description                                     |
| --------- | ------------------ | ----------------------------------------------- |
| `message` | `DeliveredMessage` | The message delivered into the agent's session. |
| `signal`  | `AbortSignal`      | Cancel the in-flight HTTP request.              |

### `DeliveredMessage`

```ts
type DeliveredMessage =
  | { kind: 'user'; body: string; attachments?: DeliveredAttachment[] }
  | {
      kind: 'signal';
      type: string;
      body: string;
      attributes?: Record<string, string>;
      tagName?: string;
    };

interface DeliveredAttachment {
  type: 'image';
  data: string;
  mimeType: string;
  filename?: string;
}
```

This is the same unified shape a server-side `dispatch()` call admits. A `kind: 'user'` message is a direct chat turn — `attachments` carry base64-encoded images (`data`, capped at 14 MiB of base64 characters each; `mimeType` such as `image/png`) for vision-capable models. A `kind: 'signal'` message is a structured event; see the [agent API reference](/api/agent-api/#deliveredmessage) for when to use each kind.

### `AgentSendResult`

```ts
interface AgentSendResult {
  streamUrl: string;
  offset: string;
  submissionId: string;
}
```

`submissionId` identifies the durable direct submission; `streamUrl` and `offset` are the coordinates for observing its conversation.

## `client.agents.wait(...)`

```ts
wait(admission: AgentSendResult, options?: AgentWaitOptions): Promise<void>;
```

Awaits completion of a prompt returned by `send()`. Resolves once the submission settles successfully, and rejects with `BapxExecutionError` when it fails or is aborted. It does not return the assistant's reply — read that from the conversation via `agents.observe()` or `agents.history()`.

`wait()` follows the durable conversation stream from the admission's `offset`, so it survives reconnects. If the process that called `wait()` disappears, the submission still settles in the background; re-observe the conversation to recover the outcome.

### `AgentWaitOptions`

| Field            | Type                                       | Description                                                                                                                   |
| ---------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `signal`         | `AbortSignal`                              | Stop waiting locally. This does not abort the submission — use `agents.abort()` for that.                                     |
| `onEvent`        | `(chunk: ConversationStreamChunk) => void` | Called for each conversation update while waiting, for progress rendering. Prefer `agents.observe()` for maintained UI state. |
| `backoffOptions` | `BackoffOptions`                           | Reconnect backoff tuning for the underlying stream.                                                                           |

## `client.agents.abort(...)`

```ts
abort(name: string, id: string, options?: { signal?: AbortSignal }): Promise<AgentAbortResult>;
```

Aborts all in-flight and queued durable work for an agent instance — the submission it is currently running and anything queued behind it. This uses `POST /agents/:name/:id/abort`.

Abort records a durable intent and returns once it is recorded; settlement happens asynchronously. The aborted work settles to a distinct **aborted** terminal outcome rather than a failure: a `submission_aborted` entry is written to the conversation (visible via `observe()`/`history()`), and a pending `wait()` rejects with `BapxExecutionError` carrying `failure: 'aborted'`. Work that has already completed is not affected — an abort that loses the race to a finished response settles as completed.

### `AgentAbortResult`

```ts
interface AgentAbortResult {
  aborted: boolean;
}
```

`aborted` is `true` when there was in-flight or queued work that is now being aborted, and `false` when the instance was idle.

## `client.agents.observe(...)`

```ts
observe(name: string, id: string, options?: AgentConversationObserveOptions): AgentConversationObservation;
```

Observes one materialized conversation across initial history catch-up, live updates, reconnects, and canonical resets. This is the default API for applications that retain conversation state.

```ts
const conversation = client.agents.observe('support', 'ticket-42', {
  live: 'sse',
});

let retry = 0;
const unsubscribe = conversation.subscribe(() => {
  const snapshot = conversation.getSnapshot();

  // A conversation that does not exist yet reports `phase: 'absent'` and stops.
  // When and how to re-check is up to you; refresh() re-runs history catch-up.
  if (snapshot.phase === 'absent') {
    setTimeout(() => conversation.refresh(), Math.min(1000 * 2 ** retry++, 30_000));
    return;
  }

  retry = 0;
  render(snapshot.conversation?.messages ?? []);
});
```

`getSnapshot()` returns the materialized `BapxConversationState`, its safe resume offset, the current phase, and any transport error. A conversation that has not been created yet reports `phase: 'absent'`; call `refresh()` to re-run history catch-up and resume live updates — the example above retries with a simple backoff — and `close()` when observation is no longer needed.

The observed conversation is a `BapxConversationState` of `BapxConversationMessage` values. Each message has clean, render-ready parts (`text`, `reasoning`, `dynamic-tool`, `file`); streaming assembly is handled internally, so a `text` part is always `{ type, text, state }`. Structured tool output appears on the `dynamic-tool` part's `output`.

## `client.agents.history(...)`

```ts
history(name: string, id: string, options?: BapxConversationHistoryOptions): Promise<BapxConversationSnapshot>;
```

Returns one materialized conversation snapshot. The snapshot includes its opaque stream `offset`; historical token deltas are already reduced into complete message parts. Use `observe()` for live state — it performs the snapshot-to-live handoff and reduction for you. The snapshot is materialized by the API on demand and is not a persisted replay cache.
