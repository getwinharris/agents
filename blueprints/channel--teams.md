---
{
  "kind": "channel",
  "version": 1,
  "website": "https://www.microsoft.com/microsoft-teams"
}
---

# Add a Microsoft Teams Channel to Bapx

You are an AI coding agent adding authenticated Microsoft Teams Bot Connector
activities and project-owned outbound messaging to a Bapx project.

## Inspect the project

Read local instructions, detect the package manager and target, and select the
first existing source root: `<root>/.agents/`, then `<root>/src/`, then
`<root>/`. Inspect existing agents, environment types, secret conventions, and
the activity families the application needs.

Install `@bapX/teams`. Do not install `@microsoft/agents-hosting` or
`@microsoft/teams.apps` as the canonical client: their current packages declare
Node runtimes and depend on Node-oriented MSAL, JWT, HTTP, or Express
infrastructure. Use the documented OAuth client-credentials and Bot Connector
REST protocols through Fetch so the integration works on Node and Cloudflare
Workers.

Install `valibot` using the project's existing dependency conventions.

## Create the Fetch client

Create `<source-dir>/lib/teams-client.ts`. Keep helpers outside the immediate
`channels/` directory because every file there is discovered as a channel
module. Implement and export a narrow
`createTeamsClient(...)` that:

- exchanges `TEAMS_APP_ID`, `TEAMS_APP_PASSWORD`, and `TEAMS_TENANT_ID` at
  `https://login.microsoftonline.com/<tenant>/oauth2/v2.0/token`;
- requests `https://api.botframework.com/.default` with
  `grant_type=client_credentials`;
- caches the access token until shortly before `expires_in`;
- posts message activities beneath the verified destination's
  `<serviceUrl>/v3/conversations/<conversationId>/activities`;
- appends `/<threadId>` for a channel-thread reply;
- binds `conversationId`, `threadId`, `botId`, and `serviceUrl` from trusted
  application code rather than model arguments;
- uses an injectable Fetch implementation for local and workerd tests.

Validate OAuth and Connector response status and shape. Never contact a service
URL supplied directly by a model or unauthenticated caller.

## Create the channel

Create `<source-dir>/channels/teams.ts`. Adapt the imported agent, dispatched
message, event policy, and tool:

```ts
// bapX-blueprint: channel/teams@1
import { defineTool, dispatch } from '@bapX/runtime';
import * as v from 'valibot';
import { createTeamsChannel, type TeamsConversationRef } from '@bapX/teams';
import assistant from '../agents/assistant.ts';
import { createTeamsClient } from '../lib/teams-client.ts';

const appId = process.env.TEAMS_APP_ID!;
const tenantId = process.env.TEAMS_TENANT_ID!;

export const client = createTeamsClient({
  appId,
  tenantId,
  appPassword: process.env.TEAMS_APP_PASSWORD!,
});

export const channel = createTeamsChannel({
  appId,
  tenantId,

  // Path: /channels/teams/activities
  async activities({ activity }) {
    if (activity.type !== 'message' || !activity.text) return;
    await dispatch(assistant, {
      id: channel.conversationKey(channel.destination(activity)),
      message: {
        kind: 'signal',
        type: 'teams.message',
        body: activity.text,
        attributes: {
          ...(activity.id === undefined ? {} : { activityId: activity.id }),
          senderId: activity.from.id,
          senderName: activity.from.name,
        },
      },
    });
  },
});

export function postMessage(ref: TeamsConversationRef) {
  return defineTool({
    name: 'post_teams_message',
    description: 'Post a message to the Microsoft Teams conversation bound to this agent.',
    input: v.object({ text: v.pipe(v.string(), v.minLength(1)) }),
    async run({ input }) {
      const { text } = input;
      const result = await client.postMessage(ref, text);
      return { activityId: result.id };
    },
  });
}
```

The callback receives the provider-native Bot Framework `Activity` (typed by
`botframework-schema`). Derive the canonical routing identity with
`channel.destination(activity)` when you need to address a reply. Switch on
`activity.type` (`message`, `conversationUpdate`, `invoke`, `messageReaction`,
and other Bot Framework types) using Microsoft's documented field names.
Returning nothing produces an empty `200`; return JSON for an invoke response
body or use the Hono context for explicit status and response control.

## Wire the agent

```ts
import { defineAgent } from '@bapX/runtime';
import { channel, postMessage } from '../channels/teams.ts';

export default defineAgent(({ id }) => ({
  model: 'anthropic/claude-haiku-4-5',
  tools: [postMessage(channel.parseConversationKey(id))],
}));
```

The channel-agent import cycle is supported only because imported bindings are
read inside deferred callbacks and initializers.

## Credentials and verification

`TEAMS_APP_ID` constrains the Bot Connector JWT audience.
`TEAMS_TENANT_ID` constrains activity tenant identity.
`TEAMS_APP_PASSWORD` authenticates outbound OAuth client credentials.

The package defaults to Microsoft's public-cloud OpenID metadata and token
issuer. For a supported sovereign cloud, pass its documented metadata URL and
issuer to `createTeamsChannel(...)` and configure the matching OAuth authority
in the project-owned client. Follow the project's secret conventions and never
invent values.

Set the Azure Bot messaging endpoint to:

```txt
https://example.com/channels/teams/activities
```

If `bapX()` has an outer mount prefix, include it in the configured URL.
Bots receive channel messages when mentioned by default. Add the appropriate
Teams resource-specific consent permissions only when the application needs all
channel or group-chat messages.

Run the project's typecheck and both Node and Cloudflare builds. Generate a
local RSA key pair, OpenID metadata, JWKS, and signed Bot Connector JWTs. Test
valid and invalid audience, issuer, expiry, endorsement, service URL, tenant,
and activity payloads. Exercise OAuth and one outbound message against an
injected local Fetch transport. Do not contact Microsoft services.

When updating an existing integration, inspect and compare it against this complete current blueprint, apply every relevant change while preserving customizations, and then add or update the marker in the primary marked file. This comparison is required when the marker is missing.

## Upgrade Guide

### Version 1 — 2026-06-14

Initial version.
