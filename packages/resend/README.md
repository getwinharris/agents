# `@bapX/resend`

Verified Resend webhook ingress for Bapx.

The package exposes one fixed `POST /webhook` route and uses the official
Resend client to verify the exact request body and signed `svix-*` headers
before calling application code.

```ts
import { createResendChannel } from '@bapX/resend';
import { Resend } from 'resend';

export const client = new Resend(process.env.RESEND_API_KEY!);

export const channel = createResendChannel({
  client,
  webhookSecret: process.env.RESEND_WEBHOOK_SECRET!,

  // Path: /channels/resend/webhook
  webhook({ event, delivery }) {
    if (event.type === 'email.received') {
      // Dispatch application work. Use delivery.id for deduplication.
    }
  },
});
```

Place this export in `channels/resend.ts`. Bapx discovers it and serves
`POST /channels/resend/webhook` relative to the `bapX()` mount.

Every verified delivery is the official `WebhookEventPayload` union, forwarded
verbatim with its provider-native `event.type`, `created_at`, and `data`
fields — including event types newer than your installed `resend` version. The
channel never wraps events in a `type: 'unknown'` envelope. Resend provides
at-least-once delivery and does not guarantee ordering; the channel is stateless
and does not deduplicate `delivery.id`.

Returning no value or a JSON-compatible value acknowledges the delivery with
`200`. A returned Hono or Fetch `Response` passes through unchanged. Resend
retries every status other than `200`, so return a non-`200` response only when
redelivery is intentional.

Receiving-domain setup, webhook registration, credentials, retrieving full
email content, attachments, replies, and other outbound behavior remain
application-owned.

The package declares `@types/node` and `@types/react` as peers because the
official SDK's public declarations expose `Buffer` and React email types. These
are declaration-only requirements and do not add Node or React runtime code to
a Worker bundle.
