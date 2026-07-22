---
title: client.workflows
description: Start workflow runs and receive their run ID.
lastReviewedAt: 2026-06-20
---

## `client.workflows.invoke(...)`

```ts
invoke(name: string, options: WorkflowInvokeOptions & { wait: 'result' }): Promise<WorkflowWaitResult>;
invoke(name: string, options?: WorkflowInvokeOptions): Promise<WorkflowInvokeResult>;
```

Starts a workflow run and returns its ID.

```ts
const run = await client.workflows.invoke('summarize', {
  input: { text: 'Summarize this document.' },
});

console.log(run.runId); // "run_01JX..."
```

If the workflow exports `runs` middleware, use the returned `runId` with [`client.runs`](/docs/sdk/runs/) to stream events, fetch events, or retrieve run metadata.

Pass `wait: 'result'` to hold the request open until the run finishes and resolve with its terminal result:

```ts
const run = await client.workflows.invoke('summarize', {
  input: { text: 'Summarize this document.' },
  wait: 'result',
});

console.log(run.result); // the workflow's return value
```

### `WorkflowInvokeOptions`

| Field    | Type          | Default | Description                                                      |
| -------- | ------------- | ------- | ---------------------------------------------------------------- |
| `input`  | `unknown`     | —       | Workflow-defined input.                                          |
| `wait`   | `'result'`    | —       | Wait for the run to finish and resolve with its terminal result. |
| `signal` | `AbortSignal` | —       | Cancel the HTTP request.                                         |

### `WorkflowInvokeResult`

```ts
interface WorkflowInvokeResult {
  runId: string;
}
```

`runId` is the server-generated workflow run ID.

### `WorkflowWaitResult`

```ts
interface WorkflowWaitResult {
  runId: string;
  result: unknown;
}
```

Returned when `wait: 'result'` is passed.
