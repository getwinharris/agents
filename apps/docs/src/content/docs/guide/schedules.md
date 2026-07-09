---
title: Schedules
description: Invoke Flue workflows or dispatch agent input on a schedule with Cloudflare or Node.js.
lastReviewedAt: 2026-06-19
---

Schedules often start bounded work such as daily summaries, recurring reports, data synchronization, or cleanup. Model that work as a Workflow and admit each occurrence with `invoke(...)`. Every occurrence gets an independent `runId`, lifecycle events, and run history.

Use `dispatch(...)` instead when the schedule is an event for an intentionally continuing Agent instance. Reusing the same agent instance ID also reuses its persistent session, which is useful only when successive occurrences should share conversation state.

Flue does not prescribe a scheduling library. Use the scheduler provided by your deployment environment and choose Workflow invocation or Agent dispatch based on the work's lifetime.

## Scheduling a Workflow on Cloudflare

Add a [Cron Trigger](https://developers.cloudflare.com/workers/configuration/cron-triggers/) to your project's `wrangler.jsonc`:

```jsonc title="wrangler.jsonc"
{
  "triggers": {
    "crons": ["0 9 * * *"],
  },
}
```

Then import the discovered Workflow's default export and invoke it from `src/cloudflare.ts`:

```ts title="src/cloudflare.ts"
import { invoke } from '@bapX/runtime';
import dailySummary from './workflows/daily-summary.ts';

export default {
  async scheduled(controller: ScheduledController) {
    await invoke(dailySummary, {
      input: {
        prompt: 'Review recent activity and prepare the daily summary.',
        scheduledAt: new Date(controller.scheduledTime).toISOString(),
      },
    });
  },
};
```

`invoke(...)` resolves after the Workflow Run is admitted and returns its `runId`; it does not wait for completion. The Workflow does not need to export an HTTP `route`. Cron Triggers use UTC. See Cloudflare's [`scheduled()` handler](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/) documentation for the complete API.

## Scheduling a Workflow on Node.js

Node.js does not include a built-in cron scheduler, so choose an ecosystem option that fits how your application is deployed. This example uses [Croner](https://croner.56k.guru/), a lightweight scheduler with async callbacks, overlap protection, and timezone support:

```ts title="src/app.ts"
import { invoke } from '@bapX/runtime';
import { Cron } from 'croner';
import dailySummary from './workflows/daily-summary.ts';

new Cron(
  '0 9 * * *',
  {
    protect: true,
    timezone: 'UTC',
    catch: (error) => console.error('Scheduled workflow admission failed', error),
  },
  async () => {
    await invoke(dailySummary, {
      input: {
        prompt: 'Review recent activity and prepare the daily summary.',
        scheduledAt: new Date().toISOString(),
      },
    });
  },
);
```

For production schedules that must survive restarts or coordinate across replicas, use a persistent scheduler such as BullMQ. An in-process scheduler like Croner only runs while that Node process is alive.

## Scheduling input for a continuing Agent

Use `dispatch(...)` when scheduled occurrences should enter one persistent Agent session:

```ts
import { dispatch } from '@bapX/runtime';
import dailySummary from './agents/daily-summary.ts';

await dispatch(dailySummary, {
  id: 'daily-summary',
  message: {
    kind: 'signal',
    type: 'schedule',
    body: 'Review recent activity and prepare the daily summary.',
    attributes: { scheduledAt: new Date().toISOString() },
  },
});
```

The stable `id` means every occurrence targets the same AgentInstance and conversation. Dispatched work returns a `dispatchId` and does not create Workflow Run history.

## Next steps

- [Workflows](/docs/guide/workflows/) — define finite scheduled operations and inspect their runs.
- [Agents](/docs/guide/building-agents/) — define a continuing agent that receives scheduled input.
- [Cloudflare](/docs/guide/targets/cloudflare/) — configure the Cloudflare target and `cloudflare.ts` entrypoint.
- [Node.js](/docs/guide/targets/node/) — build and operate the generated Node.js server.
