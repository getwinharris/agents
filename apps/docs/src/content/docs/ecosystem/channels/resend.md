---
title: Resend
description: Receive verified Resend webhooks and retrieve inbound email through the official client.
---

## Add Resend

Run the Resend blueprint through your coding agent:

```sh
flue add channel resend --print | codex
```

It installs `@flue/resend` and the official `resend@6.12.4` SDK. The blueprint
creates a channel module with named `channel` and project-owned `client`
exports.

Configure the webhook URL as:

```txt
https://example.com/channels/resend/webhook
```

`RESEND_WEBHOOK_SECRET` verifies inbound deliveries. `RESEND_API_KEY`
authenticates outbound SDK calls. They are separate credentials.

The SDK's public declarations reference `Buffer` and React email types. Add
`@types/node` and `@types/react` as development dependencies. Both are
declaration-only requirements and add no Node or React runtime code to a Worker
bundle.

## Channel module

```ts title="src/channels/resend.ts"
import { createResendChannel } from '@flue/resend';
import { defineTool, dispatch } from '@flue/runtime';
import { Resend } from 'resend';
import assistant from '../agents/assistant.ts';

const EMAIL_INSTANCE_PREFIX = 'resend-email:';

export const client = new Resend(process.env.RESEND_API_KEY!);

export const channel = createResendChannel({
  client,
  webhookSecret: process.env.RESEND_WEBHOOK_SECRET!,

  // Path: /channels/resend/webhook
  async webhook({ event, delivery }) {
    switch (event.type) {
      case 'email.received': {
        await dispatch(assistant, {
          id: emailInstanceId(event.data.email_id),
          input: {
            type: 'resend.email.received',
            deliveryId: delivery.id,
            emailId: event.data.email_id,
            messageId: event.data.message_id,
            from: event.data.from,
            to: event.data.to,
            cc: event.data.cc,
            subject: event.data.subject,
            attachments: event.data.attachments,
          },
        });
        return;
      }
      default:
        return;
    }
  },
});

export function retrieveReceivedEmail(emailId: string) {
  return defineTool({
    name: 'retrieve_resend_email',
    description: 'Retrieve the complete inbound email already bound to this agent.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    async execute() {
      const result = await client.emails.receiving.get(emailId);
      if (result.error) throw new Error(result.error.message);
      return JSON.stringify(result.data);
    },
  });
}

export function emailInstanceId(emailId: string): string {
  if (!emailId) throw new TypeError('Resend email id must be non-empty.');
  return `${EMAIL_INSTANCE_PREFIX}${encodeURIComponent(emailId)}`;
}

export function emailIdFromInstanceId(id: string): string {
  if (!id.startsWith(EMAIL_INSTANCE_PREFIX)) {
    throw new TypeError('Expected a local Resend email instance id.');
  }
  const emailId = decodeURIComponent(id.slice(EMAIL_INSTANCE_PREFIX.length));
  if (!emailId) throw new TypeError('Expected a local Resend email instance id.');
  return emailId;
}
```

`@flue/resend` gives `client.webhooks.verify()` the exact request body and the
signed `svix-id`, `svix-timestamp`, and `svix-signature` values before invoking
`webhook`. Returning nothing produces an empty `200`. A JSON-compatible value
becomes the response body, and a normal Hono or Fetch `Response` passes through
unchanged. Resend retries every status other than `200`, so return a non-`200`
response only when redelivery is intentional.

Every verified delivery is the official `WebhookEventPayload` union, forwarded
verbatim. Each event keeps its provider-native `event.type`, `created_at`, and
`data` fields, including event types newer than your installed `resend`
version. The channel never wraps events in a `type: 'unknown'` envelope, so
`switch (event.type)` narrows the modeled variants and a `default` branch
handles anything your SDK predates.

## Retrieve message content

The `email.received` webhook includes routing metadata and attachment
descriptors. Retrieve the full body, headers, and current attachment metadata
later through the project-owned client:

```ts
const email = await client.emails.receiving.get(emailId);
```

Use `client.emails.receiving.attachments` to obtain signed download URLs when
attachment content is needed. Fetch only the content authorized for the
current application action, and decide separately what may enter model context
or durable storage.

## Bind the tool

```ts title="src/agents/assistant.ts"
import { createAgent } from '@flue/runtime';
import { emailIdFromInstanceId, retrieveReceivedEmail } from '../channels/resend.ts';

export default createAgent(({ id }) => {
  const emailId = emailIdFromInstanceId(id);
  return {
    model: 'anthropic/claude-haiku-4-5',
    tools: [retrieveReceivedEmail(emailId)],
  };
});
```

The model can retrieve only the email already bound by trusted application
code. Outbound send, forward, or reply tools should likewise bind credentials,
sender identity, recipients, and message policy outside model-selected
arguments.

The `resend-email:` id is an application convention for one inbound message.
The package does not expose a conversation helper because Resend's
`message_id` identifies one message rather than a stable thread root. Define
and persist any reply-grouping policy in application code.

## Delivery behavior

Resend delivery is at least once and ordering is not guaranteed. `delivery.id`
comes from the `svix-id` Resend documents for deduplication. Claim it in
application-owned durable storage before dispatch when duplicate admission is
unacceptable.

The channel is stateless. It does not register webhooks, manage receiving
domains or MX records, store credentials, deduplicate deliveries, restore
ordering, persist messages, retrieve bodies or attachments automatically, or
send replies.

## Cloudflare Workers

The official `resend@6.12.4` client and webhook verifier execute in Node and
workerd with Flue's required `nodejs_compat` configuration. Cloudflare projects
may initialize secrets through `process.env` or typed Worker bindings, then
should verify their complete Worker build.

Test ingress with original synthetic bodies and locally generated Svix-format
HMAC signatures over the exact bytes. Test the real client against a local
fake `baseUrl` and a Fetch stub that rejects unexpected destinations. Exercise
both paths in Node and workerd; tests should never contact Resend.

Receiving-domain configuration, webhook registration, API keys, signing-secret
rotation, deduplication, persistence, outbound mail, and reply behavior remain
application-owned.

See the [`@flue/resend` API reference](/docs/api/resend-channel/).
