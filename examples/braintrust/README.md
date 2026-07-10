# Braintrust tracing for Bapx

This example registers Braintrust's public Bapx observer against Bapx's public `observe(...)` event stream.

## What it demonstrates

- One observer integration traces workflows, prompt and skill operations, model turns, tools, delegated tasks, and compactions.
- Model spans include content, errors, token usage, and estimated cost where available.
- Bapx correlation fields connect workflow and persistent-agent activity to Braintrust traces.
- The application continues without trace export when `BRAINTRUST_API_KEY` is absent.

The integration lives in [`src/app.ts`](src/app.ts). Workflows do not import Braintrust.

## Integration

The example pins Braintrust 3.17 and registers only the lifecycle events its Bapx observer consumes:

```ts
import { type BapxEvent, observe } from '@bapX/runtime';
import { braintrustBapxObserver, initLogger } from 'braintrust';

const apiKey = process.env.BRAINTRUST_API_KEY;
const observedRuns = new Set<string>();

if (apiKey) {
  initLogger({
    projectName: process.env.BRAINTRUST_PROJECT_NAME ?? 'Bapx',
    apiKey,
  });

  observe((event, ctx) => {
    const compatible = compatibleEvent(event);
    if (compatible) braintrustBapxObserver(compatible, ctx);
  });
}

function compatibleEvent(event: BapxEvent): unknown {
  if (event.type === 'run_start') {
    observedRuns.add(event.runId);
    return event;
  }
  if (event.type === 'run_end') {
    observedRuns.delete(event.runId);
    return event;
  }
  if (event.type === 'tool') return { ...event, type: 'tool_call' };
  if (event.type === 'run_resume') {
    if (observedRuns.has(event.runId)) return event;
    observedRuns.add(event.runId);
    return { ...event, type: 'run_start', input: undefined, payload: undefined };
  }
  if (
    event.type === 'operation_start' ||
    event.type === 'operation' ||
    event.type === 'turn_request' ||
    event.type === 'turn' ||
    event.type === 'tool_start' ||
    event.type === 'task_start' ||
    event.type === 'task' ||
    event.type === 'compaction_start' ||
    event.type === 'compaction'
  ) {
    return event;
  }
  return undefined;
}
```

Braintrust 3.17 expects `tool_call` for a terminal tool event, reads workflow input from the legacy synthetic `run_start.payload` field, and does not consume Bapx's `run_resume`. Normal Bapx `run_start` events keep their current public `input` shape; only a recovery event that lacks an observed start is synthesized with both `input` and `payload` explicitly undefined. This fallback does not preserve Bapx's distinct recovery semantics or durably continue a trace across isolates.

## Trace shape

For a tool-using workflow, the generated structure is:

```text
workflow:tools
  bapX.prompt
    llm:<model>
    tool:lookup_weather
    llm:<model>
```

| Bapx activity                          | Braintrust representation |
| -------------------------------------- | ------------------------- |
| Workflow invocation                    | Root `task` span          |
| Prompt, skill, or compaction operation | Nested `task` span        |
| Model turn                             | Nested `llm` span         |
| Tool call                              | Nested `tool` span        |
| Delegated task                         | Nested `task` span        |
| Context compaction                     | Nested compaction span    |

Workflows are the only Bapx executions represented as runs. Direct or dispatched persistent-agent activity uses operation, instance, session, and optional dispatch correlation instead.

## Sensitive content

Braintrust's observer is content-bearing. Braintrust 3.17 does not currently read Bapx's public `run_start.input`, but it can export workflow results, model messages and output, reasoning, system prompts, tool definitions and values, task content, errors, and correlation metadata. Use Braintrust's masking support and review retention and access requirements before enabling it for sensitive workloads. See the [Braintrust ecosystem guide](https://docs.bapx.in/ecosystem/tooling/braintrust/).

## Running it

From the repository root, install workspace dependencies:

```bash
npm install
```

Set credentials for Braintrust trace export and Anthropic model calls:

```bash
export BRAINTRUST_API_KEY='<braintrust-api-key>'
export BRAINTRUST_PROJECT_NAME='Bapx'
export ANTHROPIC_API_KEY='<anthropic-api-key>'
```

From this example directory, start the Node dev server:

```bash
npx bapX dev
```

Trigger the example workflows:

```bash
curl -X POST 'http://localhost:3583/workflows/prompt?wait=result' \
  -H 'content-type: application/json' \
  -d '{"name":"Developer"}'

curl -X POST 'http://localhost:3583/workflows/tools?wait=result' \
  -H 'content-type: application/json' \
  -d '{"city":"San Francisco"}'

curl -X POST 'http://localhost:3583/workflows/task?wait=result' \
  -H 'content-type: application/json' \
  -d '{"draft":"We are leveraging synergies to move faster."}'
```

Run the compatibility checks with:

```bash
npm run check:types
npm run build
```
