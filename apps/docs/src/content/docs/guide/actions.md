---
title: Actions
description: Define finite agent-backed operations that can be reused by workflows and agents.
---

An Action is reusable logic that orchestrates an agent harness in a deterministic, reliable way. Use one when a sensitive or reliability-critical task needs application-controlled steps, context, and results.

Actions give [workflows](/docs/guide/workflows/) and [agents](/docs/guide/building-agents/) a reliable way to perform tasks that should follow application-defined logic instead of leaving every step to the model.

## Define an Action

Create an Action with `defineAction()`:

```ts title="src/actions/summarize.ts"
import { defineAction } from '@bapX/runtime';
import * as v from 'valibot';

export const summarize = defineAction({
  name: 'summarize_document',
  description: 'Summarize a document clearly and concisely.',
  input: v.object({ text: v.string() }),
  output: v.object({ summary: v.string() }),

  async run({ harness, input, log }) {
    log.info('Summarizing document');
    const session = await harness.session();
    const response = await session.prompt(`Summarize this text:\n\n${input.text}`);
    return { summary: response.text };
  },
});
```

An Action has these parts:

- `name` is the model-facing name used when an agent exposes the Action.
- `description` helps the model decide when to call it.
- `input` is an optional top-level [Valibot](https://valibot.dev) object schema. Flue validates and transforms input before `run()` starts.
- `output` is an optional Valibot schema. Flue validates and snapshots the returned value as JSON-compatible data.
- `run({ harness, input, log })` performs the operation. Use the harness to open sessions, work with the configured sandbox, or call other agent capabilities.

This guide uses `src/actions/` to organize shared Actions, but Flue does not discover that directory. An Action becomes available only when you import it into a workflow or agent configuration.

## Use an Action in a workflow

Bind the Action to an agent with `defineWorkflow()`:

```ts title="src/workflows/summarize.ts"
import { defineAgent, defineWorkflow } from '@bapX/runtime';
import { summarize } from '../actions/summarize.ts';

export default defineWorkflow({
  agent: defineAgent(() => ({ model: 'anthropic/claude-haiku-4-5' })),
  action: summarize,
});
```

Each invocation runs `summarize` with the workflow's configured agent and records the run, result, and events under the workflow. The Action owns its schemas and handler, so the workflow does not repeat them.

Binding an Action to a workflow does not expose it to that workflow's model. Add it separately to the agent's `actions` list if the model should also be able to call it.

For behavior used by only one workflow, define `input`, `output`, and `run` directly inside `defineWorkflow()`. See [Workflows](/docs/guide/workflows/) for the recommended inline form and invocation options.

## Give an Action to an agent

Add an Action to the agent's `actions` list when the model should decide when to run it:

```ts title="src/agents/editor.ts"
import { defineAgent } from '@bapX/runtime';
import { summarize } from '../actions/summarize.ts';

export default defineAgent(() => ({
  model: 'anthropic/claude-sonnet-4-6',
  instructions: 'Help the user edit and understand their documents.',
  actions: [summarize],
}));
```

Flue presents each configured Action to the model as a framework-managed tool using its name, description, and input schema. When the model calls it, Flue runs the Action with an isolated child harness and returns its result to the conversation. The child has independent sessions while sharing the parent agent's configuration, sandbox, and filesystem. Its conversation records remain in the append-only agent-instance stream rather than being recursively deleted.

Actions share the model-facing namespace with custom and framework-provided tools, so every active capability needs a distinct name.

Adding an Action to an agent does not create a workflow or a public endpoint. To invoke the same operation as an inspectable run, bind it to a discovered workflow as well.

## When to use an Action

Actions are most useful when:

- application code needs to control the sequence of agent operations;
- sensitive or reliability-critical work needs validated inputs and results;
- a multi-step task should behave consistently instead of relying on the model to plan every step;
- the same agent-backed operation should be available to workflows, agents, or both.

For a direct application function, use a [tool](/docs/guide/tools/). For reusable instructions and resources, use a [skill](/docs/guide/skills/).

## Next steps

- [Workflows](/docs/guide/workflows/) — run inline or reusable finite behavior as an inspectable job.
- [Agents](/docs/guide/building-agents/) — expose Actions alongside an agent's other reusable capabilities.
- [Tools](/docs/guide/tools/) — define direct application functions for models.
- [Skills](/docs/guide/skills/) — package reusable instructions and supporting resources.
- [Action API](/docs/api/action-api/) — look up complete schemas, context types, and error contracts.
