---
title: Linear
description: Receive verified Linear resource and agent-session webhooks with a project-owned SDK client.
package:
  name: '@bapX/linear'
  href: https://www.npmjs.com/package/@bapX/linear
---

## Quickstart

Add verified Linear resource and agent-session webhooks with project-owned outbound Linear API access to an existing Flue project with the [Linear](https://linear.app/developers) blueprint. Run the following command in your terminal or coding agent of choice:

```sh
flue add channel linear
```

## Overview

The blueprint installs `@bapX/linear` and the official `@linear/sdk`, creates a
source-root `channels/linear.ts` module with named `channel` and project-owned
`client` exports, and modifies the selected agent to bind the generated message
tool.

```ts title="src/channels/linear.ts (abridged)"
import { createLinearChannel } from '@bapX/linear';
import { dispatch } from '@bapX/runtime';
import { LinearClient } from '@linear/sdk';
import assistant from '../agents/assistant.ts';

export const client = new LinearClient({
  apiKey: process.env.LINEAR_API_KEY!,
});

export const channel = createLinearChannel({
  webhookSecret: process.env.LINEAR_WEBHOOK_SECRET!,
  async webhook({ payload, deliveryId }) {
    if (payload.type !== 'Comment' || !('body' in payload.data)) return;
    const comment = payload.data;
    if (payload.action !== 'create' || !comment.issueId) return;
    await dispatch(assistant, {
      id: channel.conversationKey({
        type: 'issue',
        organizationId: payload.organizationId,
        issueId: comment.issueId,
        ...(comment.parentId ? { threadCommentId: comment.parentId } : {}),
      }),
      message: {
        kind: 'signal',
        type: 'linear.comment.created',
        body: comment.body,
        attributes: {
          deliveryId,
          ...(payload.actor ? { actorId: payload.actor.id } : {}),
          ...(payload.actor && 'name' in payload.actor ? { actorName: payload.actor.name } : {}),
        },
      },
    });
  },
});
```

The abridged example shows the generated comment path and omits the agent-session
branch, reusable type guards, and message tool. Once configured, a new issue
comment continues the agent instance for that issue or comment thread, while
the bound SDK tool posts replies to the same Linear conversation. The official
SDK also supports the generated agent-session path and runs with Flue's
`nodejs_compat` setting on Cloudflare Workers.

## Configure

| Variable                 | Purpose                                                                 |
| ------------------------ | ----------------------------------------------------------------------- |
| `LINEAR_WEBHOOK_SECRET`  | **Required** — Verifies inbound webhook deliveries.                     |
| `LINEAR_API_KEY`         | **Required** — Authenticates the example's outbound SDK client.         |
| `LINEAR_ORGANIZATION_ID` | **Optional** — Restricts inbound deliveries to one Linear organization. |
| `LINEAR_WEBHOOK_ID`      | **Optional** — Restricts inbound deliveries to one configured webhook.  |

It installs `@bapX/linear` for verified ingress and the official
`@linear/sdk` for project-owned outbound API access. Linear uses that SDK in
its own Cloudflare Workers agent example with `nodejs_compat`, which Flue's
Cloudflare target already enables.

Set the webhook URL to:

```txt
https://example.com/channels/linear/webhook
```

## Channel module

```ts title="src/channels/linear.ts"
import {
  createLinearChannel,
  type LinearConversationRef,
  type LinearWebhookPayload,
} from '@bapX/linear';
import { defineTool, dispatch } from '@bapX/runtime';
import { LinearClient } from '@linear/sdk';
import * as v from 'valibot';
import type {
  AgentSessionEventWebhookPayload,
  EntityWebhookPayloadWithCommentData,
} from '@linear/sdk/webhooks';
import assistant from '../agents/assistant.ts';

const organizationId = process.env.LINEAR_ORGANIZATION_ID;

export const client = new LinearClient({
  apiKey: process.env.LINEAR_API_KEY!,
});

export const channel = createLinearChannel({
  webhookSecret: process.env.LINEAR_WEBHOOK_SECRET!,
  ...(organizationId ? { organizationId } : {}),

  // Path: /channels/linear/webhook
  async webhook({ payload, deliveryId }) {
    if (isCommentEvent(payload)) {
      const comment = payload.data;
      if (payload.action !== 'create' || !comment.issueId) return;
      await dispatch(assistant, {
        id: channel.conversationKey({
          type: 'issue',
          organizationId: payload.organizationId,
          issueId: comment.issueId,
          ...(comment.parentId ? { threadCommentId: comment.parentId } : {}),
        }),
        message: {
          kind: 'signal',
          type: 'linear.comment.created',
          body: comment.body,
          attributes: {
            deliveryId,
            ...(payload.actor ? { actorId: payload.actor.id } : {}),
            ...(payload.actor && 'name' in payload.actor ? { actorName: payload.actor.name } : {}),
          },
        },
      });
      return;
    }

    if (isAgentSessionEvent(payload)) {
      await dispatch(assistant, {
        id: channel.conversationKey({
          type: 'agent-session',
          organizationId: payload.organizationId,
          agentSessionId: payload.agentSession.id,
        }),
        message: {
          kind: 'signal',
          type: `linear.agent_session.${payload.action}`,
          body: JSON.stringify({
            promptContext: payload.promptContext,
            activity: payload.agentActivity,
            session: payload.agentSession,
          }),
          attributes: { deliveryId },
        },
      });
    }
  },
});

// Linear's native union has a catch-all member that keeps `type` widened, so a
// literal `type` check alone does not narrow. Combine it with a nested field.
function isCommentEvent(
  payload: LinearWebhookPayload,
): payload is EntityWebhookPayloadWithCommentData {
  return payload.type === 'Comment' && 'body' in payload.data;
}

function isAgentSessionEvent(
  payload: LinearWebhookPayload,
): payload is AgentSessionEventWebhookPayload {
  return payload.type === 'AgentSessionEvent' && 'agentSession' in payload;
}

export function postMessage(ref: LinearConversationRef) {
  return defineTool({
    name: 'post_linear_message',
    description: 'Post to the Linear conversation bound to this agent.',
    input: v.object({ text: v.pipe(v.string(), v.minLength(1)) }),
    async run({ input: { text } }) {
      if (ref.type === 'agent-session') {
        const result = await client.createAgentActivity({
          agentSessionId: ref.agentSessionId,
          content: { type: 'response', body: text },
        });
        return { success: result.success };
      }

      const result = await client.createComment({
        issueId: ref.issueId,
        ...(ref.threadCommentId ? { parentId: ref.threadCommentId } : {}),
        body: text,
      });
      return { success: result.success };
    },
  });
}
```

Use `accessToken` instead of `apiKey` for an installed OAuth application.
OAuth installation storage and organization-specific token selection remain
application concerns.

## Bind the tool

```ts title="src/agents/assistant.ts"
import { defineAgent } from '@bapX/runtime';
import { channel, postMessage } from '../channels/linear.ts';

export default defineAgent(({ id }) => ({
  model: 'anthropic/claude-haiku-4-5',
  tools: [postMessage(channel.parseConversationKey(id))],
}));
```

Trusted code binds the organization, issue thread, or agent session. The model
selects only message text.

## Resource webhooks

Create a Linear webhook for the resource families the application handles,
typically Comments, Issues, and Projects. The package verifies the exact body
against `Linear-Signature`, rejects signed timestamps outside one minute, and
optionally checks configured organization and webhook ids.

The handler receives the provider-native `payload`, typed by Linear's official
`LinearWebhookPayload` union (re-exported from `@linear/sdk/webhooks`). Entity
deliveries are discriminated on `type` (`'Comment'`, `'Issue'`, `'Project'`, …)
and carry `action` and `data`; Flue forwards the body unmodified, including
verified deliveries the union does not model. The union has a catch-all member
that keeps `type` widened to `string`, so a literal `type` check alone does not
narrow it — pair the literal with a discriminating nested field in a small
application-side type guard (as in the channel module above).

The application derives conversation keys from native fields. Top-level comments
use the issue conversation; replies pass the root comment id as
`threadCommentId` for the nested thread.

## Agent sessions

Enable Agent session events on a Linear OAuth application configured as an app
actor. Install it with the scopes required by your operations and
`app:mentionable` when users should mention the agent.

`created` events carry the `agentSession` and may include Linear's formatted
`promptContext`, `previousComments`, and `guidance`. `prompted` events carry the
new `agentActivity`. The application builds a stable agent-session conversation
key from `payload.agentSession.id`.

Linear expects the webhook response within five seconds and a new session to
receive an activity or external URL update within ten seconds. Keep the
verified handler focused on durable dispatch admission, then use the
project-owned SDK client to post progress and results.

## Delivery behavior

Returning nothing produces an empty `200`. Return JSON for a response body or
use the Hono context for explicit status control. A failure or non-`200`
response asks Linear to retry.

Linear treats a delivery as failed if it does not return `200` within five
seconds, then retries after one minute, one hour, and six hours. The channel
does not enforce a timer; admit durable work quickly (dispatch, then return) and
rely on idempotency rather than blocking on slow work before responding.

The channel requires Linear's UUID-v4 `Linear-Delivery` header and exposes it
for application-owned deduplication, but does not persist delivery state.
Conversation keys validate syntax, not authorization.

See the [`@bapX/linear` README](https://github.com/getwinharris/agents/tree/main/packages/linear#readme).
