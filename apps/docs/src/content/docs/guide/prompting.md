---
title: Prompting
description: Perform prompt operations and obtain text, structured data, media-aware, and cancellable results.
---

Use `session.prompt(...)` when application code needs a model response within an existing session. A prompt is one **operation** in that session: it appends user and assistant activity to the session conversation, can invoke tools or internal result-handling turns, and returns metadata for the complete operation.

This guide assumes you already have a created agent and are obtaining its initialized environment through a [workflow](/docs/guide/workflows/) or an addressable [agent](/docs/guide/building-agents/). For model selection and provider setup, see [Models & Providers](/docs/guide/models/).

## Send a prompt

Call `prompt(text, options?)` on a session. Awaiting it returns a **response object**, not the generated string itself.

```ts title=".flue/workflows/answer-question.ts"
import { createAgent, type FlueContext } from '@flue/runtime';

const assistant = createAgent(() => ({
  model: 'anthropic/claude-sonnet-4-6',
}));

export async function run({ init, payload }: FlueContext<{ question: string }>) {
  const harness = await init(assistant);
  const session = await harness.session();
  const response = await session.prompt(payload.question);

  return {
    answer: response.text,
    model: response.model.id,
    tokens: response.usage.totalTokens,
  };
}
```

`session.prompt(...)` returns an awaitable `CallHandle`. In ordinary code, await it directly as above. Keep the handle when you need to cancel the operation later; see [Cancellation](#cancellation).

A session retains its conversation context. Sequential calls can therefore build on earlier prompts:

```ts title=".flue/workflows/follow-up.ts"
import { createAgent, type FlueContext } from '@flue/runtime';

const analyst = createAgent(() => ({
  model: 'anthropic/claude-sonnet-4-6',
}));

export async function run({ init }: FlueContext) {
  const harness = await init(analyst);
  const session = await harness.session('analysis');

  await session.prompt('Read the incident summary and identify the most likely cause.');
  const followUp = await session.prompt('Now provide three mitigations in priority order.');

  return followUp.text;
}
```

Do not start two prompt operations concurrently on the same session. A session permits one active `prompt`, `skill`, `task`, `shell`, or explicit `compact` operation at a time so that its conversation branch stays ordered. Create separate named sessions when independent branches should run concurrently.

## Consume text responses

Without a structured `result` option, a successful prompt resolves to a text response with these fields:

| Field | Use it for |
| --- | --- |
| `response.text` | Assistant text generated for the operation. |
| `response.usage` | Aggregated token and cost usage for model work performed by the operation. |
| `response.model.id` | Model selected for the operation's primary call after defaults and overrides are applied. |

```ts title=".flue/workflows/draft-email.ts"
import { createAgent, type FlueContext } from '@flue/runtime';

const writer = createAgent(() => ({
  model: 'anthropic/claude-haiku-4-5',
}));

export async function run({ init, payload }: FlueContext<{ request: string }>) {
  const harness = await init(writer);
  const session = await harness.session();
  const response = await session.prompt(`Draft a concise email response to:\n\n${payload.request}`);

  return {
    email: response.text,
    model: response.model.id,
    cost: response.usage.cost.total,
  };
}
```

Use text responses for prose or when your application can treat the answer as unvalidated display content. If application logic needs dependable fields, request a structured result instead of parsing prose.

## Obtain structured results

Pass a Valibot schema as `result` when the operation must return validated application data. For an object result, use the canonical `result: v.object(...)` form and read the validated value from `response.data`.

```ts title=".flue/workflows/classify-ticket.ts"
import { createAgent, ResultUnavailableError, type FlueContext } from '@flue/runtime';
import * as v from 'valibot';

const triage = createAgent(() => ({
  model: 'anthropic/claude-sonnet-4-6',
}));

export async function run({ init, payload }: FlueContext<{ ticket: string }>) {
  const harness = await init(triage);
  const session = await harness.session();

  try {
    const response = await session.prompt(`Classify this support ticket:\n\n${payload.ticket}`, {
      result: v.object({
        priority: v.picklist(['low', 'medium', 'high', 'urgent']),
        summary: v.string(),
        needsHumanReview: v.boolean(),
      }),
    });

    return {
      classification: response.data,
      usage: response.usage,
      model: response.model.id,
    };
  } catch (error) {
    if (error instanceof ResultUnavailableError) {
      return {
        classification: null,
        unavailableReason: error.reason,
      };
    }

    throw error;
  }
}
```

A structured response provides `data`, `usage`, and `model`; use `response.data`, not textual extraction. `data` has the inferred output type of the Valibot schema, including validated transformations or defaults expressed by that schema.

`result` and `data` are the current names for this API. Do not write new code with the older `schema` option or the former structured-return field name.

### How structured result completion works

When you pass `result`, Flue makes two operation-scoped completion tools available to the model:

- `finish`: submits a candidate value for validation against your schema. A successful `finish` completes the operation and becomes `response.data`.
- `give_up`: explicitly reports that the model cannot produce a conforming result, along with a reason.

This means a structured-result operation can contain more than one model turn:

1. Flue sends your prompt together with instructions for completing the structured result.
2. The model calls `finish` with candidate data or `give_up` with a reason.
3. If a `finish` payload does not satisfy the schema, the model receives the validation failure as a tool error and can submit a corrected payload in a later turn.
4. If the model ends a turn without either completion tool, Flue sends a reminder and gives it another chance to complete the result.

If the model calls `give_up`, awaiting `session.prompt(...)` throws `ResultUnavailableError`. The error exposes `reason`, supplied by the model, and `assistantText`, text from the latest assistant response available when the failure is surfaced, so application code can decide whether to retry, ask for user input, or surface a useful failure.

Flue also raises `ResultUnavailableError` if repeated follow-up turns never produce either a successful `finish` or `give_up` result. Treat structured output as validated but fallible: catch this error wherever a missing result is an expected application outcome.

Keep the schema focused on data your application actually requires. A schema that asks the model for unnecessary detail increases the chance of correction turns or an unavailable result.

## Attach images for multimodal input

Supply `images` to attach inline image content to the prompt's user message. Each image uses this shape:

```ts title="PromptImage shape"
type PromptImage = {
  type: 'image';
  data: string;
  mimeType: string;
};
```

`data` is base64-encoded image data and `mimeType` identifies its media type, such as `image/png` or `image/jpeg`.

```ts title=".flue/workflows/read-receipt.ts"
import { createAgent, type FlueContext } from '@flue/runtime';
import * as v from 'valibot';

const visionAgent = createAgent(() => ({
  model: 'anthropic/claude-sonnet-4-6',
}));

export async function run({ init, payload }: FlueContext<{ pngBase64: string }>) {
  const harness = await init(visionAgent);
  const session = await harness.session();
  const response = await session.prompt('Extract the merchant and total from this receipt.', {
    images: [
      {
        type: 'image',
        data: payload.pngBase64,
        mimeType: 'image/png',
      },
    ],
    result: v.object({
      merchant: v.string(),
      total: v.number(),
      currency: v.string(),
    }),
  });

  return response.data;
}
```

The selected model must support image input. An operation-level model override can change whether a given prompt is capable of processing its supplied images; choose a vision-capable model deliberately and verify support with your provider. See [Models & Providers](/docs/guide/models/) for selecting and overriding models.

Images work with both text and structured responses. In a structured-result operation, images are included on the initial turn only. If validation requires result-correction or completion-reminder turns, those follow-up turns contain text instructions without resending image bytes; the model continues from the session conversation containing the initial image-bearing message.

## Override behavior for one operation

The normal model and reasoning behavior belong on the created agent or its profile. Pass options to `prompt(...)` when one operation needs a different model, reasoning effort, or temporary tool.

### Select a different model or reasoning level

```ts title=".flue/workflows/review-answer.ts"
import { createAgent, type FlueContext } from '@flue/runtime';

const assistant = createAgent(() => ({
  model: 'anthropic/claude-haiku-4-5',
  thinkingLevel: 'low',
}));

export async function run({ init }: FlueContext) {
  const harness = await init(assistant);
  const session = await harness.session();

  const draft = await session.prompt('Draft an answer to the customer question.');
  const review = await session.prompt(`Review this answer for correctness:\n\n${draft.text}`, {
    model: 'anthropic/claude-sonnet-4-6',
    thinkingLevel: 'high',
  });

  return review.text;
}
```

Both overrides apply only to that operation. Model precedence for `prompt(...)` is:

```text
operation model override > configured agent or profile default
```

Reasoning-level precedence is:

```text
operation thinkingLevel > configured agent or profile default > framework default ('medium')
```

`thinkingLevel` is a request to the selected model/provider integration, not a guarantee that every provider exposes the same reasoning controls or output. For supported levels, provider setup, and capability details, see [Models & Providers](/docs/guide/models/).

### Supply tools for one prompt

Pass `tools` when a capability should be available only while handling this prompt. Model calls needed to consume a tool result are still part of the same prompt operation.

```ts title=".flue/workflows/lookup-order.ts"
import { Type, createAgent, defineTool, type FlueContext } from '@flue/runtime';

const supportAgent = createAgent(() => ({
  model: 'anthropic/claude-sonnet-4-6',
}));

export async function run({ init, payload }: FlueContext<{ orderId: string }>) {
  const harness = await init(supportAgent);
  const session = await harness.session();
  const findOrder = defineTool({
    name: 'find_order',
    description: 'Fetch the current status for an order id.',
    parameters: Type.Object({ orderId: Type.String() }),
    execute: async ({ orderId }) => JSON.stringify({ orderId, status: 'shipped' }),
  });

  const response = await session.prompt(`Tell the customer the status of order ${payload.orderId}.`, {
    tools: [findOrder],
  });

  return response.text;
}
```

See [Tools](/docs/guide/tools/) for defining reusable tools, choosing their scope, and understanding model-called tool activity.

## Measure usage and selected model

Both text and structured responses expose `usage` and `model.id`:

```ts title=".flue/workflows/measure-summary.ts"
import { createAgent, type FlueContext } from '@flue/runtime';

const summarizer = createAgent(() => ({
  model: 'anthropic/claude-haiku-4-5',
}));

export async function run({ init, payload }: FlueContext<{ content: string }>) {
  const harness = await init(summarizer);
  const session = await harness.session();
  const response = await session.prompt(`Summarize:\n\n${payload.content}`);

  return {
    text: response.text,
    model: response.model.id,
    tokens: {
      input: response.usage.input,
      output: response.usage.output,
      cacheRead: response.usage.cacheRead,
      cacheWrite: response.usage.cacheWrite,
      total: response.usage.totalTokens,
    },
    cost: response.usage.cost.total,
  };
}
```

`response.usage` has token fields `input`, `output`, `cacheRead`, `cacheWrite`, and `totalTokens`, plus corresponding `cost` fields and `cost.total`. Cost units follow the selected model's configured per-token rate; built-in commercial-provider model pricing is normally denominated in USD, while custom models or proxies may use different units.

Usage represents model work recorded for this prompt **operation** in its session, not necessarily one provider request. Its aggregate can include:

- multiple assistant turns when the model calls tools and then uses their results;
- result validation correction or completion-reminder turns for `result` prompts;
- automatic context-compaction model calls triggered while performing the operation; and
- a model retry following context-overflow recovery.

A model-invoked `task` tool creates a detached child session. Model work in that child session is not rolled into the parent prompt's returned `response.usage`; use child/task observations when accounting for delegated work. For per-turn timings and usage, tool spans, compaction activity, and correlation identifiers, observe the operation as described in [Observability](/docs/guide/observability/).

## Cancel an in-flight prompt

`session.prompt(...)` immediately returns a `CallHandle` that is both awaitable and abortable. Call `abort()` when application logic decides that the result is no longer needed.

```ts title=".flue/workflows/cancellable-answer.ts"
import { createAgent, type FlueContext } from '@flue/runtime';

const assistant = createAgent(() => ({
  model: 'anthropic/claude-sonnet-4-6',
}));

export async function run({ init }: FlueContext) {
  const harness = await init(assistant);
  const session = await harness.session();
  const handle = session.prompt('Produce a detailed migration strategy.');

  const timer = setTimeout(() => handle.abort('request cancelled'), 5_000);

  try {
    const response = await handle;
    return response.text;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return 'cancelled';
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}
```

You can also pass an external `AbortSignal`, including a deadline signal. Flue merges it into the operation handle's cancellation signal.

```ts title=".flue/workflows/deadline-summary.ts"
import { createAgent, type FlueContext } from '@flue/runtime';

const summarizer = createAgent(() => ({
  model: 'anthropic/claude-haiku-4-5',
}));

export async function run({ init, payload }: FlueContext<{ content: string }>) {
  const harness = await init(summarizer);
  const session = await harness.session();

  const response = await session.prompt(`Summarize:\n\n${payload.content}`, {
    signal: AbortSignal.timeout(10_000),
  });

  return response.text;
}
```

After `handle.abort(reason)` or an aborted `options.signal`, awaiting the handle rejects with an `AbortError` (`DOMException`). The supplied abort reason is available as the error's `cause` where the runtime permits it. A signal that is already aborted prevents the operation from beginning.

Cancellation applies to the active prompt loop, its compaction work, and any delegated work it has started. Operation-scoped custom tools receive an `AbortSignal` as the second argument to `execute`, and should pass it into cancellable downstream work where applicable.

Actual interruption at a remote boundary depends on that boundary. In particular, shell work performed by a sandbox connector can stop mid-flight only when its underlying implementation is signal-aware; a signal-blind remote connector may not observe cancellation until its request returns. Use a connector- or provider-native deadline as well when hard remote execution limits matter.

## Understand operations and turns

One call to `session.prompt(...)` is one session **operation**. That operation may contain several **turns**, where a turn is one model round-trip. Tool use, structured-result correction, completion reminders, compaction, or overflow recovery can add turns without creating another application-level prompt operation.

```text
operation: session.prompt(...)
  turn: model receives prompt and requests a tool
  tool: application performs the tool call
  turn: model consumes the tool result and answers
```

Operations and turns are also different from workflow runs. A prompt performed within a workflow is nested work inside that workflow run. A prompt sent directly to a persistent agent instance, or processed after `dispatch(...)`, is an operation in a persistent session and is **not** a workflow run.

A single session runs only one active operation at a time. If two branches need model work concurrently, allocate separate session names so that each branch has independent ordered conversation state:

```ts title=".flue/workflows/parallel-comparisons.ts"
import { createAgent, type FlueContext } from '@flue/runtime';

const reviewer = createAgent(() => ({
  model: 'anthropic/claude-sonnet-4-6',
}));

export async function run({ init }: FlueContext) {
  const harness = await init(reviewer);
  const security = await harness.session('security');
  const usability = await harness.session('usability');

  const [securityResponse, usabilityResponse] = await Promise.all([
    security.prompt('Review the proposal for security risks.'),
    usability.prompt('Review the proposal for usability risks.'),
  ]);

  return {
    security: securityResponse.text,
    usability: usabilityResponse.text,
  };
}
```

Use [Observability](/docs/guide/observability/) when you need to inspect operation boundaries, model turns, tool calls, usage, cancellation failures, or context compaction. Use [Agents](/docs/guide/building-agents/) for continuing session scope and persisted conversation state, and [Workflows](/docs/guide/workflows/) for the finite orchestration boundary around operations.