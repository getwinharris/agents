---
title: Subagents
description: Delegate focused work to child sessions using reusable agent profiles.
---

Use a task when an agent should hand a focused objective to a fresh conversation: inspecting a package, reviewing a change, extracting a result, or performing a bounded specialist step. The delegated work can use the same sandbox workspace while keeping its investigation out of the parent session's conversation history.

A task is a **session operation** that creates a detached child session. It is not a workflow invocation and it does not create a workflow run. When a task is performed inside a workflow, it is nested work within that existing run. When a task is performed during direct or dispatched agent activity, it remains agent-session activity without a run identity.

This guide shows how to:

- delegate anonymous work with `session.task(...)`;
- define and select named reusable specialist profiles;
- receive typed structured task results;
- control the child's working directory, context, capabilities, and model;
- observe and cancel delegated work safely; and
- avoid concurrency and nesting mistakes.

For surrounding concepts, see [Agents](/docs/guide/building-agents/), [Tools](/docs/guide/tools/), [Workflows](/docs/guide/workflows/), and [Observability](/docs/guide/observability/).

## Delegate focused work with an anonymous task

Call `session.task(...)` without an `agent` option when the child should use the parent's task defaults. This gives the task a new child session with a fresh conversation history, while retaining access to the parent session's sandbox environment.

```ts title=".flue/workflows/investigate.ts"
import { createAgent, type FlueContext } from '@flue/runtime';
import { local } from '@flue/runtime/node';

const analyst = createAgent(() => ({
  model: 'anthropic/claude-sonnet-4-6',
  instructions: 'Provide evidence-based engineering answers.',
  sandbox: local(),
  cwd: process.cwd(),
}));

export async function run({ init }: FlueContext) {
  const harness = await init(analyst);
  const session = await harness.session();

  const response = await session.task(
    'Inspect the authentication package and identify where refresh tokens are validated. Return file paths and function names.',
    { cwd: 'packages/auth' },
  );

  return { finding: response.text };
}
```

The workflow in this example has one workflow run because its exported `run(...)` function was invoked. The call to `session.task(...)` is not a second run: it is a `task` operation inside the initialized harness session.

This and the later repository-inspection examples use Node's `local()` sandbox so the child can see files in the current project. Use it only where host filesystem and shell access are an appropriate trusted boundary. On another target or with isolated compute, hydrate or connect a sandbox workspace before sending tasks to paths inside it; see [Sandboxes](/docs/guide/sandboxes/).

An anonymous task is useful when the task needs isolation of conversation history but not a distinct specialist configuration. Give it a focused request that includes the expected output, evidence requirements, and any scope boundary the child cannot infer from prior parent conversation.

## Understand child-session behavior

Each task creates a child session for one delegated request. The child is detached from the parent's conversation context: it does not start with the parent's message transcript or informal conclusions. It receives its own prompt, images when supplied, its resolved configuration, and discovered workspace context.

| Aspect | Task behavior |
| --- | --- |
| Conversation history | The child starts a separate session history rather than continuing the parent's transcript. |
| Session identity | The child session is identified internally from its parent session and generated `taskId`, in the form `task:<parent-session>:<task-id>`. |
| Sandbox | The child uses the parent's sandbox environment, so it can see and modify the same workspace files available there. |
| Working directory | The child defaults to the parent session working directory; pass `cwd` to scope it to another directory in that same sandbox. |
| Return boundary | `session.task(...)` returns the child result to application code; it does not merge the child's entire conversation into the parent transcript. |
| Observation | Task and child-operation events carry correlation fields such as `taskId` and `parentSession`. |
| Run identity | A task does not create a run. Only a surrounding workflow invocation has a `runId`. |

Because the workspace is shared, detached does **not** mean filesystem-isolated. A child that edits files affects later work in the same sandbox. Prompt read-only research tasks explicitly when they should not change files, and separate potentially conflicting branches in application logic.

## Define a reusable specialist profile

Use `defineAgentProfile(...)` when delegated work should consistently receive a role, model choice, reasoning setting, skills, tools, or its own allowed nested subagents.

A profile is reusable configuration. It is not a deployed agent module and it has no addressable URL or persistent instance identity. A created agent can use a profile as its own baseline behavior, or can expose named profiles through `subagents` so a task can select specialist behavior within that initialized environment.

```ts title=".flue/workflows/review-change.ts"
import { createAgent, defineAgentProfile, type FlueContext } from '@flue/runtime';
import * as v from 'valibot';

const reviewer = defineAgentProfile({
  name: 'reviewer',
  description: 'Reviews TypeScript changes for concrete correctness risks.',
  model: 'anthropic/claude-sonnet-4-6',
  thinkingLevel: 'high',
  instructions: 'Report only issues with a reproducible failure scenario and relevant file evidence.',
});

const coordinator = createAgent(() => ({
  model: 'anthropic/claude-haiku-4-5',
  subagents: [reviewer],
}));

const Review = v.object({
  summary: v.string(),
  risks: v.array(
    v.object({
      file: v.string(),
      issue: v.string(),
      scenario: v.string(),
    }),
  ),
});

export async function run({ init }: FlueContext) {
  const harness = await init(coordinator);
  const session = await harness.session();
  const response = await session.task('Review the pending TypeScript changes in packages/runtime.', {
    agent: 'reviewer',
    result: Review,
  });

  return response.data;
}
```

Attach profiles through `subagents` on the created agent configuration, a reused base profile, or `init(agent, { subagents: [...] })`. Every selectable subagent must have a unique valid `name`; selection fails if a task asks for a name that was not declared in its current session configuration.

## Select a named subagent

Pass `{ agent: 'name' }` to choose a declared profile for a task:

```ts title=".flue/workflows/triage.ts"
import { createAgent, defineAgentProfile, type FlueContext } from '@flue/runtime';
import { local } from '@flue/runtime/node';

const dependencyAuditor = defineAgentProfile({
  name: 'dependency_auditor',
  instructions: 'Inspect dependencies and return actionable upgrade risks only.',
});

const agent = createAgent(() => ({
  model: 'anthropic/claude-sonnet-4-6',
  sandbox: local(),
  cwd: process.cwd(),
  subagents: [dependencyAuditor],
}));

export async function run({ init }: FlueContext) {
  const harness = await init(agent);
  const session = await harness.session();
  const response = await session.task('Audit dependency usage under packages/cli.', {
    agent: 'dependency_auditor',
    cwd: 'packages/cli',
  });

  return response.text;
}
```

Named selection matters because a selected profile establishes a capability boundary for that child. It is not simply a label added while the child inherits everything from the parent.

### Know what a selected profile replaces

The following behavior applies when Flue constructs a child session for a task:

| Configuration | Anonymous task | Task with a selected named profile |
| --- | --- | --- |
| Instructions | Uses the parent agent instructions. | Uses the profile's `instructions` when defined; otherwise falls back to parent instructions. |
| Declared skills | Uses parent declared skills, merged with skills discovered in the child's `cwd`. | Uses profile `skills` when defined; otherwise falls back to parent declared skills, then merges skills discovered in the child's `cwd`. |
| Custom agent tools | Uses parent agent tools, plus any task-local tools. | Uses profile `tools` when defined; otherwise falls back to parent agent tools, plus any task-local tools. |
| Available named subagents for further delegation | Uses the parent's declared `subagents`. | Uses only the selected profile's own nested `subagents`; parent declarations are not automatically forwarded. |
| Model default | Uses the parent configured model unless the task overrides it. | Uses the profile model when defined, otherwise the parent configured model, unless the task overrides it. |
| Thinking default | Uses the parent configured level, then Flue's `'medium'` default. | Uses the profile level when defined, otherwise the parent level, then `'medium'`, unless the task overrides it. |
| Compaction configuration | Uses the parent configuration. | Uses the profile configuration when defined; otherwise falls back to the parent configuration. |

Built-in workspace and delegation tools are provided by the active sandbox/tool integration separately from profile custom tools. Setting `tools: []` on a named profile prevents parent custom agent tools from being adopted; it does not mean that no framework or sandbox-provided tools exist. Similarly, `skills: []` prevents adoption of parent declared skills, but skills discovered from the task working directory are still evaluated for that child.

Use nested `subagents` deliberately. If a specialist is allowed to delegate only to another bounded specialist, declare that relationship on the selected profile:

```ts title=".flue/workflows/specialists.ts"
import { createAgent, defineAgentProfile } from '@flue/runtime';

const evidenceReader = defineAgentProfile({
  name: 'evidence_reader',
  instructions: 'Find file evidence without modifying the workspace.',
});

const reviewer = defineAgentProfile({
  name: 'reviewer',
  instructions: 'Assess only findings supported by repository evidence.',
  subagents: [evidenceReader],
});

export const agent = createAgent(() => ({
  model: 'anthropic/claude-sonnet-4-6',
  subagents: [reviewer],
}));
```

When a task selects `reviewer`, that child can select `evidence_reader`; it does not automatically receive any other subagent attached to `agent`.

## Return structured task data

For application logic, prefer a validated result instead of parsing freeform child text. Supply the canonical `result` option and read the validated value from `response.data`:

```ts title=".flue/workflows/locate-boundary.ts"
import { createAgent, type FlueContext } from '@flue/runtime';
import { local } from '@flue/runtime/node';
import * as v from 'valibot';

const agent = createAgent(() => ({
  model: 'anthropic/claude-sonnet-4-6',
  sandbox: local(),
  cwd: process.cwd(),
}));

const Boundary = v.object({
  files: v.array(v.string()),
  entrypoint: v.string(),
  explanation: v.string(),
});

export async function run({ init }: FlueContext) {
  const harness = await init(agent);
  const session = await harness.session();
  const response = await session.task('Locate the HTTP authentication boundary and explain its entrypoint.', {
    cwd: 'packages/server',
    result: Boundary,
  });

  return {
    boundary: response.data,
    tokens: response.usage.totalTokens,
    model: response.model.id,
  };
}
```

Without `result`, a task resolves to a text response with `response.text`, `response.usage`, and `response.model`. With `result`, it resolves to structured data with `response.data`, plus the same usage and model metadata. `schema` and `response.result` are deprecated aliases; write new code with `result` and `data`.

## Override one task's inputs and behavior

`session.task(...)` accepts operation-local options. These apply to this delegated child request, without changing defaults for later parent or child work.

| Option | Purpose |
| --- | --- |
| `agent` | Select a named profile declared for the current session. Omit it for an anonymous task. |
| `result` | Validate structured task output and return it as `response.data`. |
| `cwd` | Set the child working directory and therefore its local context and skill discovery scope. |
| `tools` | Add custom tools for this task invocation. |
| `model` | Override the model used for this task. |
| `thinkingLevel` | Override reasoning effort for this task. |
| `images` | Attach images to the child's initial user message; the selected model must support vision input. |
| `signal` | Cancel the task from an external `AbortSignal`. |

```ts title=".flue/workflows/inspect-screenshot.ts"
import { createAgent, defineAgentProfile, type FlueContext, type PromptImage } from '@flue/runtime';
import * as v from 'valibot';

const uiAuditor = defineAgentProfile({
  name: 'ui_auditor',
  model: 'anthropic/claude-haiku-4-5',
  thinkingLevel: 'low',
});

const agent = createAgent(() => ({
  model: 'anthropic/claude-haiku-4-5',
  subagents: [uiAuditor],
}));

const Findings = v.object({
  findings: v.array(v.string()),
});

export async function run({ init, payload }: FlueContext<{ screenshot: PromptImage }>) {
  const harness = await init(agent);
  const session = await harness.session();
  const response = await session.task('Find accessibility problems visible in this screenshot.', {
    agent: 'ui_auditor',
    model: 'anthropic/claude-sonnet-4-6',
    thinkingLevel: 'high',
    images: [payload.screenshot],
    result: Findings,
    signal: AbortSignal.timeout(30_000),
  });

  return response.data;
}
```

Task model precedence is:

```text
operation model override > selected subagent profile model > parent agent or profile default
```

An anonymous task has no selected-profile tier. A named profile with `model: false` intentionally supplies no usable model default; provide a task-level model in that case unless some later configuration changes the choice. For broader model setup, see [Models & Providers](/docs/guide/models/).

Task reasoning precedence follows the same practical shape: task-local `thinkingLevel` wins; otherwise a selected profile's configured level is used when present, then the parent's configured level, then Flue defaults to `'medium'`.

## Choose a working directory and discovered context

A child shares the sandbox but discovers context for its own effective `cwd`. Use this to send repository work to the most relevant directory rather than relying on the parent's already established context.

```ts title=".flue/workflows/package-review.ts"
import { createAgent, type FlueContext } from '@flue/runtime';
import { local } from '@flue/runtime/node';

const agent = createAgent(() => ({
  model: 'anthropic/claude-sonnet-4-6',
  sandbox: local(),
  cwd: process.cwd(),
}));

export async function run({ init }: FlueContext) {
  const harness = await init(agent);
  const session = await harness.session();
  return session.task('Read package guidance and identify the command used to type-check this package.', {
    cwd: 'packages/runtime',
  });
}
```

For a delegated task, Flue resolves `cwd` in the parent sandbox and constructs a child context there. At that directory, the child discovers:

- `AGENTS.md`, when present;
- `CLAUDE.md`, when present;
- workspace skills under `.agents/skills/<name>/SKILL.md`; and
- the directory listing included in its initial system context.

Discovery is performed for the new child session rather than copied from the parent transcript. A named profile's selected instructions and declared skills participate in that newly assembled child context according to the selection table above. If a discovered workspace skill has the same name as a declared skill active for that child, initialization fails instead of silently choosing one.

A focused task prompt should still be self-contained. Fresh child history means the child does not know which earlier parent findings matter unless the task text, attached files, accessible workspace state, or selected instructions convey them.

## Distinguish explicit tasks from the built-in `task` tool

There are two ways delegated work can begin:

| Form | Who decides to delegate? | Best used for |
| --- | --- | --- |
| `await session.task(prompt, options)` | Your TypeScript application logic | Required delegation, typed results, explicit profile selection, operation options, and deterministic orchestration. |
| Built-in model-facing `task` tool | The model during `prompt()` or `skill()` work | Optional exploration or specialist delegation that the model determines is useful. |

The built-in `task` tool creates the same kind of detached child session and can select a declared agent name or `cwd`. It returns the child's final textual answer to the calling model as a tool result; application code does not receive a task-level structured `response.data` contract from that tool call. Use explicit `session.task(...)` when your program requires a validated delegated result or needs to control task-local `model`, `thinkingLevel`, `images`, or `signal` directly.

## Observe task identity and events

A task emits child-session activity that can be correlated without treating it as a run. Within an existing workflow, all of this activity remains nested beneath the workflow's one `runId`. During a direct or dispatched agent interaction, use agent and operation correlation fields instead of looking for a run.

| Field or event | Meaning |
| --- | --- |
| `operation_start` / `operation` with `operationKind: 'task'` | The explicit parent `session.task(...)` operation boundary. |
| `task_start` / `task` | The delegated task span, including success or error and duration. |
| `taskId` | The generated identity that associates the delegation span with child activity. |
| `parentSession` | The session that requested the child work. |
| Child `session` | The detached conversation scope used for the delegated prompt. |
| Child `operation_start` / `operation` with `operationKind: 'prompt'` | The model-facing prompt performed inside the child session. |
| `turnId` and tool events | Model turns and executable actions inside the child prompt, where applicable. |

For event streams, trace mapping, sensitive content guidance, and the distinction between workflow run history and agent interaction events, see [Observability](/docs/guide/observability/).

## Cancel tasks and constrain nested delegation

Like other session calls, `session.task(...)` returns an awaitable call handle. Abort the handle directly or pass an external signal:

```ts title=".flue/workflows/bounded-review.ts"
import { createAgent, type FlueContext } from '@flue/runtime';

const agent = createAgent(() => ({
  model: 'anthropic/claude-sonnet-4-6',
}));

export async function run({ init }: FlueContext) {
  const harness = await init(agent);
  const session = await harness.session();
  const handle = session.task('Review the repository for an unsafe token handling path.', {
    signal: AbortSignal.timeout(20_000),
  });

  try {
    return await handle;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { cancelled: true };
    }
    throw error;
  }
}
```

Aborting a task cancels the in-flight child operation and propagates through nested active child tasks. Awaiting an aborted handle rejects with an `AbortError`; if cancellation carries a reason, it is available as the error cause.

A task child can itself delegate work only while staying within Flue's maximum task depth of **4**. In practical terms, an originating session can create a child at depth 1, which can create descendants through depth 4; a task already at depth 4 cannot create another task. Prefer shallow, explicitly scoped delegation over chains of agents handing off ambiguous objectives.

## Run parallel branches safely

A session permits only one active operation at a time. Do not run application-directed `prompt()`, `skill()`, `task()`, `shell()`, or `compact()` calls concurrently on the same session. Use separate named sessions for independent branches:

```ts title=".flue/workflows/parallel-investigation.ts"
import { createAgent, type FlueContext } from '@flue/runtime';
import { local } from '@flue/runtime/node';

const agent = createAgent(() => ({
  model: 'anthropic/claude-sonnet-4-6',
  sandbox: local(),
  cwd: process.cwd(),
}));

export async function run({ init }: FlueContext) {
  const harness = await init(agent);
  const apiBranch = await harness.session('api-review');
  const persistenceBranch = await harness.session('persistence-review');

  const [api, persistence] = await Promise.all([
    apiBranch.task('Inspect API boundary risks.', { cwd: 'packages/runtime/src/runtime' }),
    persistenceBranch.task('Inspect session persistence risks.', { cwd: 'packages/runtime/src' }),
  ]);

  return { api: api.text, persistence: persistence.text };
}
```

The model-facing built-in tool system can manage task calls it elects to issue during one model operation. When TypeScript orchestration decides to start parallel work, separate parent sessions keep each conversation branch and its operation lifecycle well-defined.

## Related guides

- [Agents](/docs/guide/building-agents/) covers created-agent configuration and continuing sessions.
- [Workflows](/docs/guide/workflows/) covers initialized environments and sessions during finite orchestration.
- [Tools](/docs/guide/tools/) covers model-invoked executable capabilities, including delegation as a built-in tool.
- [Models & Providers](/docs/guide/models/) covers defaults, overrides, and reasoning configuration.
- [Workflows](/docs/guide/workflows/) defines finite orchestrations and why runs remain workflow-only.
- [Observability](/docs/guide/observability/) covers task, operation, turn, and workflow event correlation.
