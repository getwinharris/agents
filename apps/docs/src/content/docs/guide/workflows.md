---
title: Workflows
description: Understand finite orchestrations that execute as observable workflow runs.
---

A workflow is Flue's boundary for finite, result-oriented orchestration. It receives an input payload, runs TypeScript application logic, may initialize agents and perform operations, and eventually returns a result or fails. Each invocation has a distinct identity and an inspectable lifecycle.

This makes a workflow different from an [agent](/docs/concepts/agents/). An agent is useful when a named instance and its sessions need to continue accepting interactions over time. A workflow is useful when the application needs to say: run this job once, observe what happened, and record its outcome.

## What is a workflow?

A workflow is a module in `workflows/` or `.flue/workflows/` that exports a callable `run(...)` function. The filename gives the workflow its discovered name; for example, `.flue/workflows/summarize.ts` defines the `summarize` workflow.

A workflow does not need an agent. It can perform ordinary TypeScript orchestration, use environment bindings, log progress, and return a value. When model-driven or sandboxed work is needed, it can initialize a created agent and use that agent's harness and sessions within the same invocation.

```text
workflow definition: summarize
  ├─ invocation A ─► runId workflow:summarize:... ─► result or error
  ├─ invocation B ─► runId workflow:summarize:... ─► result or error
  └─ invocation C ─► runId workflow:summarize:... ─► result or error
```

An invocation of a workflow is a **workflow run**. A workflow run begins once the invocation is admitted and ends once `run(...)` returns or throws. During that interval, Flue captures its lifecycle, structured logs, and any nested agent or tool activity as events.

## Define a workflow

The essential workflow contract is an exported `run(...)` function. It receives a `FlueContext`, which provides the workflow's identity, payload, platform environment, request information, structured logger, and agent initializer.

```ts title=".flue/workflows/summarize.ts"
import { createAgent, type FlueContext } from '@flue/runtime';
import * as v from 'valibot';

type SummarizePayload = {
  text: string;
  audience?: string;
};

type SummarizeResult = {
  summary: string;
  keyPoints: string[];
};

const agent = createAgent(() => ({
  model: 'anthropic/claude-haiku-4-5',
}));

export async function run({ init, log, payload }: FlueContext<SummarizePayload>): Promise<SummarizeResult> {
  log.info('summarization started', { audience: payload.audience ?? 'general' });

  const harness = await init(agent);
  const session = await harness.session();
  const response = await session.prompt(
    `Summarize this text for ${payload.audience ?? 'a general audience'}:\n\n${payload.text}`,
    {
      result: v.object({
        summary: v.string(),
        keyPoints: v.array(v.string()),
      }),
    },
  );

  log.info('summarization completed', {
    keyPointCount: response.data.keyPoints.length,
    tokens: response.usage.totalTokens,
  });

  return response.data;
}
```

The application logic remains visible in TypeScript: the workflow decides what input the agent receives, which validated data is returned, and which progress signals matter to operators. An agent operation is one step inside this orchestration, not the workflow boundary itself.

### The workflow context

`FlueContext<TPayload, TEnv>` uses TypeScript generics to describe the payload and platform bindings available to your code. Those generic types do not perform runtime validation of incoming payloads; validate untrusted inputs as appropriate for your application boundary.

| Context member | Meaning in a workflow |
| --- | --- |
| `ctx.id` | The unique identity of this workflow invocation. For workflows, `ctx.id === runId`. |
| `ctx.payload` | Input supplied for this invocation, typed by `TPayload` when provided. |
| `ctx.env` | Platform bindings: for example, Node environment values or Cloudflare bindings, typed by `TEnv` when provided. |
| `ctx.req` | The Fetch `Request` associated with the invocation when available, useful for request metadata or signature-related application logic. |
| `ctx.log` | Structured `info`, `warn`, and `error` events that become part of workflow observation and run history. |
| `ctx.init(agent)` | Initializes a created agent for this invocation and returns a harness. |

The run identity is intentional. A workflow is not a stable, long-lived agent instance with repeated incoming prompts: each invocation receives a new `runId`, and that same value is the context identity used while running its orchestration.

## Initialize agents within a workflow

A created agent defines the model, tools, instructions, sandbox, and persistence choices needed for agent work. A workflow opts into that environment only when it calls `init(...)`:

```ts title=".flue/workflows/draft-release-notes.ts"
import { createAgent, type FlueContext } from '@flue/runtime';

const writer = createAgent(({ id, payload }) => ({
  model: 'anthropic/claude-sonnet-4-6',
  instructions: `Draft release notes for workflow run ${id} from the supplied change summary.`,
}));

export async function run({ init, payload }: FlueContext<{ changes: string }>) {
  const harness = await init(writer);
  const session = await harness.session();
  const response = await session.prompt(`Write release notes for:\n\n${payload.changes}`);

  return { markdown: response.text };
}
```

`init(writer)` initializes that created agent with this workflow invocation's identity and payload. In other words, the agent initializer sees the same invocation boundary as the workflow: its `id` is the workflow `runId`, and its `payload` is the workflow payload.

The returned `harness` is the initialized agent environment. A session obtained from it can perform operations such as `prompt()`, `skill()`, `task()`, or `shell()`. Those operations may contain model turns and tool calls, but they remain nested work inside the one workflow run:

```text
workflow run { runId }
  └─ harness = await init(agent)
      └─ session = await harness.session()
          └─ operation: session.prompt(...)
              ├─ model turn
              ├─ tool call, if requested
              └─ model turn, if needed
```

Initialization is demand-driven: a branch that does not call `init(...)` does not initialize its agent. This lets one workflow combine deterministic decisions with agent work only where it is needed.

The returned `harness` is the workflow's handle to this initialized environment. The following sections cover naming environments, using sessions, and staging runtime context; see [Building Agents](/docs/guide/building-agents/) for the created-agent configuration shared with directly addressable agents.

### Name or augment an initialized environment

`init(agent)` creates an environment named `"default"`. During a workflow invocation, you can assign another name or add capabilities for one initialized use of the created agent:

```ts title=".flue/workflows/compare.ts"
import { createAgent, type FlueContext } from '@flue/runtime';
import { policyTools } from '../shared/policy-tools.ts';
import { auditSkills } from '../shared/audit-skills.ts';
import { reviewerProfiles } from '../shared/reviewer-profiles.ts';

const analyst = createAgent(() => ({
  model: 'anthropic/claude-sonnet-4-6',
}));

export async function run({ init }: FlueContext) {
  const harness = await init(analyst, {
    name: 'audit',
    tools: policyTools,
    skills: auditSkills,
    subagents: reviewerProfiles,
  });
  const session = await harness.session();

  return session.prompt('Assess the proposed policy change.');
}
```

| `init(agent, options)` field | Effect |
| --- | --- |
| `name` | Selects the environment identity within this workflow invocation. Defaults to `"default"`. |
| `tools` | Adds application-defined tools to those configured by the created agent or its profile. |
| `skills` | Adds registered skills to those configured by the created agent or its profile. |
| `subagents` | Adds named profiles that a task may select. |

`init(...)` does not accept `cwd`, `sandbox`, persistence, or compaction configuration. Those options define the created agent's runtime boundary and belong in `createAgent(...)` or its profile. Within one invocation, initialize each environment name once; assign distinct names when orchestration requires separate initialized environments.

### Use sessions inside a workflow

A harness contains named sessions. `harness.session()` selects the `"default"` session; passing a name selects another conversation branch within the same initialized environment.

Sequential operations in one session can use prior conversation state:

```ts title=".flue/workflows/triage.ts"
import { createAgent, type FlueContext } from '@flue/runtime';

const triage = createAgent(() => ({
  model: 'anthropic/claude-sonnet-4-6',
}));

export async function run({ init }: FlueContext) {
  const harness = await init(triage);
  const session = await harness.session();

  await session.prompt('Read the issue and identify the likely component.');
  return session.prompt('Now propose a focused validation plan for that component.');
}
```

Use separate named sessions for independent branches:

```ts title=".flue/workflows/compare-reviews.ts"
import { createAgent, type FlueContext } from '@flue/runtime';

const reviewer = createAgent(() => ({
  model: 'anthropic/claude-sonnet-4-6',
}));

export async function run({ init }: FlueContext) {
  const harness = await init(reviewer);
  const security = await harness.session('security');
  const maintainability = await harness.session('maintainability');

  const [securityResult, maintainabilityResult] = await Promise.all([
    security.prompt('Review the change for security risks.'),
    maintainability.prompt('Review the change for maintenance risks.'),
  ]);

  return {
    security: securityResult.text,
    maintainability: maintainabilityResult.text,
  };
}
```

One session permits one active operation at a time. Use different sessions for concurrent branches, or [Subagents](/docs/guide/subagents/) when work should be delegated into child-session history. See [Prompting](/docs/guide/prompting/) for operation ordering and results.

Workflow session identity is scoped by:

```text
runId × harness name × session name
```

Because every workflow invocation gets a new `runId`, named sessions ordinarily coordinate work inside one finite run. Use a directly addressable [agent](/docs/guide/building-agents/) when later inbound interactions need to reopen a continuing application identity and session.

### Prepare runtime context before initialization

The created agent chooses its sandbox and working directory. At initialization, Flue discovers workspace guidance such as `<cwd>/AGENTS.md`, `<cwd>/CLAUDE.md`, and workspace skills inside that sandbox. If a workflow generates any of these inputs, write them before initializing the environment that should use them.

```ts title=".flue/workflows/review-generated-workspace.ts"
import { mkdir, writeFile } from 'node:fs/promises';
import { createAgent, type FlueContext } from '@flue/runtime';
import { local } from '@flue/runtime/node';

const cwd = '/tmp/flue-review-workspace';

const reviewer = createAgent(() => ({
  model: 'anthropic/claude-sonnet-4-6',
  sandbox: local(),
  cwd,
}));

export async function run({ init }: FlueContext) {
  await mkdir(cwd, { recursive: true });
  await writeFile(`${cwd}/AGENTS.md`, 'Review only TypeScript source and report affected tests.');
  await writeFile(`${cwd}/change-request.md`, 'Check the request-validation change.');

  const harness = await init(reviewer);
  const session = await harness.session();

  return session.prompt('Read change-request.md and carry out the review.');
}
```

Writing a guidance file after `init(...)` makes it available as a workspace file, but does not retroactively add it to that environment's discovered system context. If later setup must be discovered, initialize a distinct named environment after setup.

### Stage files and shell work deliberately

A workflow can prepare or inspect an initialized sandbox without placing every setup step into model-visible conversation history:

| Surface | Appropriate use | Recorded in session conversation state? |
| --- | --- | --- |
| `harness.fs` | Stage input files or retrieve artifacts without choosing a conversation. | No. |
| `session.fs` | Perform application-owned filesystem plumbing while holding a session. | No. |
| `harness.shell(command)` | Prepare or inspect the sandbox outside conversation. | No. |
| `session.shell(command)` | Execute shell work that later model turns should know occurred. | Yes, as a shell-tool-shaped exchange. |
| Model-called file or shell tools | Let the model choose workspace actions during an operation. | Yes, through the transcript and events. |

```ts title=".flue/workflows/summarize-artifact.ts"
import { createAgent, type FlueContext } from '@flue/runtime';

const summarizer = createAgent(() => ({
  model: 'anthropic/claude-sonnet-4-6',
  cwd: '/workspace',
}));

export async function run({ init, payload }: FlueContext<{ report: string }>) {
  const harness = await init(summarizer);
  await harness.fs.writeFile('inputs/report.md', payload.report);

  const session = await harness.session();
  await session.shell('ls inputs');
  return session.prompt('Read inputs/report.md and summarize its principal findings.');
}
```

Filesystem and shell methods depend on the configured sandbox capability. Relative paths resolve against the configured `cwd`, and writing a file out of band does not automatically tell the model that it exists. See [Sandboxes](/docs/guide/sandboxes/) for execution surfaces and [Tools](/docs/guide/tools/) when a narrower application-owned capability is preferable to general shell access.

## Payloads and results

A workflow payload is input to one invocation. It might describe a report to compose, a document to transform, a repository task to inspect, or parameters for a CI operation. A workflow result is the value returned by `run(...)`.

```ts title=".flue/workflows/prepare-report.ts"
import type { FlueContext } from '@flue/runtime';

type Payload = {
  reportDate: string;
  includeDrafts: boolean;
};

export async function run({ id, log, payload }: FlueContext<Payload>) {
  log.info('preparing report', { reportDate: payload.reportDate, runId: id });

  return {
    reportDate: payload.reportDate,
    includedDrafts: payload.includeDrafts,
    status: 'prepared',
  };
}
```

When a prompt should produce application data rather than freeform prose, use a structured prompt result and return its validated `data`, as in the `summarize` example above. This separates two concerns:

| Concern | Owned by |
| --- | --- |
| What payload a workflow accepts | Your workflow interface and ingress validation |
| How an agent produces structured data | The session operation's `result` schema |
| What the caller receives from the completed workflow | The value returned from `run(...)` |

Payload and result also participate in observation. A workflow run record contains its supplied payload and completed result or error, and its lifecycle events may include model input, output, tool activity, and structured log attributes. Treat run history as potentially sensitive application data; the [Observability](/docs/guide/observability/) guide discusses event content and export choices.

## Workflow runs

Every workflow invocation creates one run identity. Generated workflow IDs contain the workflow name and a unique suffix, such as `workflow:summarize:...`. Within `run(...)`, you access that identity as `ctx.id`:

```ts title=".flue/workflows/audit.ts"
import type { FlueContext } from '@flue/runtime';

export async function run(ctx: FlueContext<{ recordId: string }>) {
  ctx.log.info('audit started', { recordId: ctx.payload.recordId, runId: ctx.id });
  return { audited: ctx.payload.recordId, runId: ctx.id };
}
```

For a workflow, these values describe the same finite invocation:

| Identity or record | Meaning |
| --- | --- |
| `ctx.id` | Runtime identity inside `run(...)`. Equal to the run ID. |
| `runId` | Correlation key returned to an invoker and attached to run events. |
| `owner.workflowName` | Name of the workflow definition that is running. |
| `owner.instanceId` | Runtime owner identity for the invocation. For workflows, equal to `runId`. |

### Lifecycle and events

A workflow run has an outer lifecycle envelope around everything it does:

```text
run_start { runId, workflowName, payload }
  log events from ctx.log.*(...)
  operation events from initialized harness sessions
    model turns, tools, tasks, or compaction events as applicable
run_end { runId, result | error, durationMs }
```

A run is recorded as `active` while it is executing, then becomes `completed` if `run(...)` returns or `errored` if it throws. The final result or error and duration are associated with that terminal state.

This envelope provides a useful root for debugging or tracing orchestration: a slow model operation, an application warning, and the final output can all be related to the same `runId`. See [Observability](/docs/guide/observability/) for event detail, structured logging, `observe(...)`, and telemetry integration.

### Only workflows have runs

A created agent can be used in two different settings, but those settings have different roots:

| Activity | Intended shape | Root identity | In workflow run history? |
| --- | --- | --- | --- |
| Workflow invokes `init(agent)` and performs session operations | Finite orchestration that may use an agent | `runId` | Yes; operations are nested in the workflow run. |
| Direct HTTP or WebSocket prompt to an agent instance | Attached interaction in a persistent session | `instanceId` and `operationId` | No. |
| `dispatch(...)` sends asynchronous input to an agent session | Message-driven persistent processing | `dispatchId`, `instanceId`, and `operationId` | No. |

`/runs` history and `flue logs` apply to workflow runs only. Direct agent prompts and dispatched agent inputs can still be observed through their attached streams or application-wide observation, but they do not become runs merely because model work occurred.

## Invoke a workflow

Defining `run(...)` makes a module a workflow; exposure and observation decide how callers start and follow it. The same finite workflow concept applies whether it is invoked locally, over HTTP, or through a WebSocket.

| Invocation surface | How it is enabled | High-level observation shape |
| --- | --- | --- |
| Local CLI | The workflow is discovered in the project; it does not need network exposure. | `flue run` executes one workflow run and reports its events and result locally. |
| HTTP | The module exports `route` middleware that continues to the workflow handler. | The caller can accept a `runId`, wait for a result, or stream new-run events. |
| WebSocket | The module exports `websocket` middleware that accepts the upgrade. | One invocation sends its `runId`, events, and result over the socket, then completes. |

### Local execution

`flue run` is useful for a finite local or CI invocation. It discovers and executes a workflow directly through the built Node application, without requiring that the module be exposed over HTTP or WebSockets:

```bash
pnpm exec flue run summarize --target node --payload '{"text":"Flue workflows are finite orchestrations."}'
```

Because this is still a workflow invocation, it has a run identity and lifecycle. This is different from opening an interactive connection to an agent instance.

### Optional HTTP exposure

A workflow becomes HTTP-addressable when its module exports `route` middleware and that middleware continues into the Flue handler:

```ts title=".flue/workflows/summarize.ts"
import type { WorkflowRouteHandler } from '@flue/runtime';

export const route: WorkflowRouteHandler = async (_c, next) => next();
```

An HTTP-exposed workflow can be started with `POST /workflows/summarize`. At a conceptual level, the caller chooses one of three ways to observe the same admitted execution:

| HTTP observation mode | Caller receives | Appropriate when |
| --- | --- | --- |
| Accepted, the default | An immediate `202` response with `{ status: 'accepted', runId }`. | The caller wants to submit work and inspect or follow it separately. |
| Wait for result, with `?wait=result` | A completed JSON result envelope that includes the `runId`. | The caller can keep the request open until the bounded job finishes. |
| Stream, by accepting `text/event-stream` | Server-sent lifecycle and nested-work events for the newly started run. | The caller wants live progress while the job executes. |

The `route` export is also an application boundary: it can authenticate or reject an HTTP request before calling `next()`. Detailed endpoint composition and authentication belong in [Routing](/docs/guide/routing/).

### Optional WebSocket exposure

A workflow becomes WebSocket-addressable when it exports `websocket` middleware:

```ts title=".flue/workflows/summarize.ts"
import type { WorkflowWebSocketHandler } from '@flue/runtime';

export const websocket: WorkflowWebSocketHandler = async (_c, next) => next();
```

A workflow WebSocket represents one finite invocation, not a persistent conversation. The client supplies an invocation payload; the server identifies the run, emits events and a result or error for that run, and closes after completion. An agent WebSocket has a different purpose: it remains connected for sequential prompts against a persistent agent instance.

### Inspect an admitted run later

When invocation returns a `runId`, run history can be read independently of the original request or socket:

| Surface | Purpose |
| --- | --- |
| `GET /runs/<runId>` | Read the workflow run record, including its status and terminal outcome when available. |
| `GET /runs/<runId>/events` | Read persisted events for the run. |
| `GET /runs/<runId>/stream` | Replay persisted events and, while an active run continues, tail new events until completion. |
| `flue logs <runId>` | Inspect or follow a workflow run from the command line. |

These are observation surfaces for workflow runs, not invocation surfaces for agents. For operational usage, filtering, and event semantics, continue to [Observability](/docs/guide/observability/).

## When to use a workflow

Choose a workflow when your application has a bounded objective and benefits from one inspectable outcome:

- generate a report, migration proposal, release note draft, or content transformation;
- orchestrate several deterministic and agent-driven steps into one returned result;
- execute finite local or CI automation with a clear success or failure boundary;
- accept an HTTP job and provide a `runId` for later inspection;
- expose live progress for one task while retaining its completed history.

Choose an [agent](/docs/concepts/agents/) instead when the core abstraction is a continuing instance or session: an assistant that receives multiple messages, a chat thread that accumulates context, or event-driven processing delivered by `dispatch(...)`.

The distinction is not whether a model is involved. A workflow may initialize an agent; an agent interaction may do complex work. The distinction is lifecycle and identity:

```text
Need one bounded, observable result?       Choose a workflow run.
Need a persistent instance or conversation? Choose an agent session.
```

A well-factored Flue application can use both: persistent agents for continuing interactions, and workflows for finite orchestration whose payload, progress, and outcome should be inspectable as a run.
