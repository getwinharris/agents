---
{ "kind": "tooling", "version": 1, "website": "https://vitest-evals.sentry.dev" }
---

# Add vitest-evals to Bapx

You are an AI coding agent adding `vitest-evals` to a Bapx project. Create a separate eval suite that exercises the application's public HTTP boundary through `@bapX/sdk`. Do not import Bapx runtime internals or replace the project's unit-test setup.

## Inspect the project

Read local instructions and detect the package manager. Inspect `package.json`, TypeScript configuration, existing Vitest configuration, agents, workflows, route authentication, CI configuration, and ignore files. Keep eval support files under `src/evals/`, independent of whether Bapx application sources use `.agents/`, `src/`, or the project root.

Ask which agent or workflow and which observable behavior should form the starter eval when that is not clear from the project. Do not invent a product requirement merely to produce a passing case.

The primary agent used below must already expose an HTTP route. Do not add an unauthenticated `route` export without confirming that exposing the agent is appropriate. When the application protects its routes, preserve that boundary and configure the SDK client with the required token or headers.

## Install dependencies

Install `@bapX/sdk`, `vitest`, and `vitest-evals` as development dependencies using the project's package manager. Preserve existing version and workspace conventions. Do not install a runtime-specific `@vitest-evals/harness-*` package: the custom harness below evaluates the deployed Bapx application rather than Bapx's underlying model runtime.

## Create the eval configuration

Create `vitest.evals.config.ts` unless the project already has a dedicated eval configuration. Merge equivalent existing configuration instead of replacing it:

```ts title="vitest.evals.config.ts"
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/evals/**/*.eval.ts'],
    reporters: ['default', 'vitest-evals/reporter'],
    testTimeout: 60_000,
  },
});
```

Keep this separate from ordinary unit-test configuration because live-model evals usually need different file discovery, timeouts, credentials, and reporting.

Merge these scripts into `package.json`, preserving existing scripts:

```json
{
  "scripts": {
    "evals": "vitest run --config vitest.evals.config.ts",
    "evals:json": "vitest run --config vitest.evals.config.ts --reporter=vitest-evals/reporter --reporter=json --outputFile.json=vitest-results.json"
  }
}
```

Ensure the project's TypeScript configuration includes `src/evals/**/*.ts` and `vitest.evals.config.ts` when its existing include rules require this. Add `vitest-results.json` to the project's ignore file when adding the JSON script.

## Create the Bapx harness

Create `src/evals/harness.ts`:

```ts title="src/evals/harness.ts"
// bapX-blueprint: tooling/vitest-evals@1
import { createBapxClient, type BapxConversationMessage } from '@bapX/sdk';
import { createHarness, type SimpleToolCallRecord } from 'vitest-evals';

export interface BapxAgentHarnessOptions {
  agentName: string;
  baseUrl?: string;
  token?: string;
  headers?: Record<string, string>;
}

function lastAssistantMessage(
  messages: BapxConversationMessage[],
): BapxConversationMessage | undefined {
  return messages.findLast((entry) => entry.role === 'assistant');
}

function messageText(message: BapxConversationMessage | undefined): string {
  if (!message) return '';
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

function collectToolCalls(messages: BapxConversationMessage[]): SimpleToolCallRecord[] {
  return messages.flatMap((message) =>
    message.parts.flatMap((part) => {
      if (part.type !== 'dynamic-tool') return [];
      return [
        {
          id: part.toolCallId,
          name: part.toolName,
          arguments: part.input,
          ...(part.state === 'output-error'
            ? { error: part.errorText }
            : part.state === 'output-available'
              ? { result: part.output }
              : {}),
        },
      ];
    }),
  );
}

export function createBapxAgentHarness(options: BapxAgentHarnessOptions) {
  const client = createBapxClient({
    baseUrl: options.baseUrl ?? process.env.FLUE_BASE_URL ?? 'http://127.0.0.1:3583',
    token: options.token,
    headers: options.headers,
  });

  return createHarness<string, string>({
    name: `bapX-${options.agentName}-agent`,
    run: async ({ input, signal }) => {
      const instanceId = `eval-${crypto.randomUUID()}`;
      const admission = await client.agents.send(options.agentName, instanceId, {
        message: { kind: 'user', body: input },
        signal,
      });
      await client.agents.wait(admission, { signal });
      const history = await client.agents.history(options.agentName, instanceId, { signal });
      const reply = lastAssistantMessage(history.messages);
      const usage = reply?.metadata?.usage;
      const model = reply?.metadata?.model;

      return {
        output: messageText(reply),
        toolCalls: collectToolCalls(history.messages),
        // The reply's own message metadata carries usage/model — agent prompts
        // are fire-and-forget and have no separate "result" to read this from.
        ...((usage ?? model)
          ? {
              usage: {
                ...(model ? { provider: model.provider, model: model.id } : {}),
                ...(usage
                  ? {
                      inputTokens: usage.input,
                      outputTokens: usage.output,
                      totalTokens: usage.totalTokens,
                      metadata: { cost: usage.cost.total },
                    }
                  : {}),
              },
            }
          : {}),
      };
    },
  });
}
```

Agent prompts are fire-and-forget: `send()` admits the prompt and `wait()` only awaits completion, so the following `history()` snapshot — read after `wait()` resolves — contains the completed messages and tool activity for that fresh instance. The harness creates a new agent instance for every `run(...)`; reuse an instance only inside an application-specific harness for a case that intentionally evaluates conversation memory.

Do not remove the abort signal or derive tool calls from runtime-internal events. Preserve output, token usage, cost, and tool activity unless project-specific data policy requires omitting them.

## Add a starter eval

Create the first eval under `src/evals/` for a behavior the application intentionally supports. Name files by the capability or scenario they evaluate—for example, `src/evals/service-health.eval.ts`—rather than assuming one eval file per agent. Adapt the harness target, input, and assertions to the application instead of copying placeholders:

```ts title="src/evals/service-health.eval.ts"
import { expect } from 'vitest';
import { describeEval, toolCalls } from 'vitest-evals';
import { createBapxAgentHarness } from './harness.ts';

const harness = createBapxAgentHarness({ agentName: 'service-status' });

describeEval('service status agent', { harness }, (it) => {
  it('checks live service status before answering', async ({ run }) => {
    const result = await run('Is the checkout service currently operational?');

    expect(result.output).toContain('operational');
    expect(toolCalls(result).map((call) => call.name)).toContain('get_service_status');
    expect(result.usage.totalTokens).toBeGreaterThan(0);
  });
});
```

Prefer deterministic assertions for exact contracts such as structured output, required tools, prohibited tools, or stable content. Add a `vitest-evals` judge only when the behavior is genuinely semantic. Configure its model separately from the agent under evaluation.

For a workflow, create a project-specific harness around `client.workflows.invoke(name, { input, wait: 'result' })`. Return the workflow's application-facing result as `output`, and retain `runId` in metadata or artifacts. Do not force workflow behavior through the agent harness.

## Run and report evals

The eval process does not start the Bapx application. For local evaluation, start the server in one terminal and wait until it is ready:

```sh
npx bapX dev
```

Then run the evals from a second terminal:

```sh
npm run evals
```

To evaluate an existing deployment instead, do not start a local server. Point the suite at the deployed application:

```sh
FLUE_BASE_URL=https://preview.example.com npm run evals
```

Use the project's package-manager equivalents. Provider credentials belong to the Bapx server process. Authentication credentials for a protected Bapx route belong to the SDK client configuration; do not commit either kind of secret.

`npm run evals:json` writes `vitest-results.json`. Inspect it with `npx vitest-evals serve vitest-results.json`, or publish it with the `getsentry/vitest-evals` GitHub Action. `vitest-evals` has no built-in Braintrust reporter. Bapx's Braintrust tooling may be enabled independently to trace the application execution, but it does not replace eval cases, assertions, judges, or CI gates.

## Verify

1. Type-check the project and run its existing lint checks.
2. Build the Bapx target and confirm the selected agent or workflow is discovered.
3. Start the application with provider credentials and run the starter eval.
4. Confirm the report includes output, usage, and the expected tool calls.
5. Intentionally break one assertion and confirm the eval command exits non-zero, then restore it.
6. Run against `FLUE_BASE_URL` when deployed-target evaluation is required.
7. If the target is protected, confirm the eval succeeds only with the intended authentication.
8. Review prompts, outputs, tool values, errors, and report artifacts for sensitive data before retaining or uploading them.

When updating an existing integration, inspect and compare it against this complete current blueprint, apply every relevant change while preserving application-specific harnesses, authentication, scripts, and assertions, and then add or update the marker in `src/evals/harness.ts`. This comparison is required when the marker is missing.

## Upgrade Guide

### Version 1 — 2026-06-18

Initial version.
