---
title: Messenger Channel API
description: Reference for verified Facebook Messenger Page ingress from @flue/messenger.
---

Import from `@flue/messenger`.

## `createMessengerChannel()`

```ts
function createMessengerChannel<E extends Env = Env>(
  options: MessengerChannelOptions<E>,
): MessengerChannel<E>;
```

Creates GET verification and signed POST delivery routes at `/webhook` for one
fixed Facebook Page. The channel verifies Meta's GET handshake and the
exact-body `X-Hub-Signature-256` HMAC, confirms each entry targets the
configured Page, and forwards the provider-native payload unchanged. It is
stateless and does not deduplicate messages or deliveries.

## `MessengerChannelOptions`

```ts
interface MessengerChannelOptions<E extends Env = Env> {
  appSecret: string;
  verifyToken: string;
  pageId: string;
  bodyLimit?: number;
  webhook(input: MessengerWebhookHandlerInput<E>): MessengerHandlerResult;
}
```

| Field         | Description                                                   |
| ------------- | ------------------------------------------------------------- |
| `appSecret`   | Meta app secret for exact-body HMAC-SHA256 validation.        |
| `verifyToken` | User-chosen token for Meta's GET verification handshake.      |
| `pageId`      | Required Page id in every accepted entry.                     |
| `bodyLimit`   | Maximum JSON body in bytes. Default: 1 MiB.                   |
| `webhook`     | Callback for one verified, potentially batched HTTP delivery. |

## `MessengerChannel`

```ts
interface MessengerChannel<E extends Env = Env> {
  readonly routes: readonly ChannelRoute<E>[];
  conversationKey(ref: MessengerConversationRef): string;
  parseConversationKey(id: string): MessengerConversationRef;
  conversationRef(event: MessengerMessagingEvent): MessengerConversationRef | undefined;
}
```

A file named `channels/messenger.ts` serves GET and POST requests at
`/channels/messenger/webhook` relative to the `flue()` mount.

The channel is stateless. It does not persist or deduplicate messages,
deliveries, reads, or retries.

## Handler input

```ts
interface MessengerWebhookHandlerInput<E extends Env = Env> {
  c: Context<E>;
  payload: MessengerWebhookPayload;
}
```

`payload` is the provider-native Page webhook payload, passed through after
exact-body verification and the fixed-Page identity check. One signed POST may
batch several entries and several events. Events stay in Meta's delivered
order. The channel does not reshape, filter, or deduplicate them.

## Webhook payload

```ts
interface MessengerWebhookPayload {
  object: 'page';
  entry: MessengerEntry[];
  [key: string]: unknown;
}

interface MessengerEntry {
  id: string;
  time: number;
  messaging?: MessengerMessagingEvent[];
  standby?: MessengerMessagingEvent[];
  changes?: MessengerChange[];
  [key: string]: unknown;
}
```

Each `entry` corresponds to one Page. `messaging` carries events the Page is
the active receiver for; `standby` carries the same item shape while another
app owns the conversation (Handover protocol); `changes` carries Page-field
change notifications. Field names and nesting match Meta's documented wire
shapes, and every modeled object carries a `[key: string]: unknown` index
signature so authenticated but unmodeled fields forward at runtime rather than
being discarded.

## Messaging events

```ts
interface MessengerMessagingEvent {
  sender?: MessengerSender;
  recipient?: MessengerRecipient;
  timestamp?: number;
  message?: MessengerMessage;
  message_edit?: MessengerMessageEdit;
  postback?: MessengerPostback;
  reaction?: MessengerReaction;
  delivery?: MessengerDelivery;
  read?: MessengerRead;
  optin?: MessengerOptin;
  referral?: MessengerReferral;
  [key: string]: unknown;
}
```

The event family is discriminated by **which property is present**, exactly as
Meta delivers it — there is no synthetic `type` field. A `message` event has
`event.message`, a postback has `event.postback`, a reaction has
`event.reaction`, and so on. Unmodeled families still arrive intact through the
index signature.

`MessengerSender` and `MessengerRecipient` carry an optional `id` (the
page-scoped id, or PSID) and an optional `user_ref` (a pre-PSID reference set
by Customer Matching or the checkbox plugin); the Page is identified by its own
`id`.

`MessengerMessage` exposes the native `mid`, optional `text`, `attachments[]`
(`type`, `payload.url`, `payload.sticker_id`), `quick_reply.payload`,
`reply_to.mid`, `referral`, `commands[].name`, and the echo fields `is_echo`,
`app_id`, and `metadata`. Field names stay snake_case and attachment payloads
remain provider-native after verification.

`MessengerOptin.notification_messages_token` is a short-lived marketing-message
capability. Keep it and complete native payloads out of model context, dispatch
input, logs, and durable session data.

## Conversation identity

```ts
type MessengerParticipantRef =
  | { type: 'page-scoped-id'; id: string }
  | { type: 'user-ref'; id: string };

interface MessengerConversationRef {
  pageId: string;
  participant: MessengerParticipantRef;
}
```

`conversationKey(ref)` serializes a canonical namespaced identifier suitable for
a Flue agent-instance id; `parseConversationKey(id)` parses only keys it
produced. These are identifiers, not authorization capabilities, and the
page-scoped-id and `user_ref` participant types use distinct key forms.

`conversationRef(event)` derives the counterpart participant — the non-Page
actor — for one native messaging event, returning the same `MessengerConversationRef`
for both inbound deliveries and Page echoes, or `undefined` when the event
carries no usable `sender`/`recipient` pair for this Page.

## Handler results

```ts
type MessengerHandlerResult =
  | undefined
  | JsonValue
  | Response
  | Promise<undefined | JsonValue | Response>;
```

Returning `undefined` produces `EVENT_RECEIVED` with status `200`, the response
body Meta's quick start documents for a webhook. A JSON-compatible value becomes
a JSON response. An ordinary Hono or Fetch `Response` passes through unchanged.

## Errors

- `InvalidMessengerConversationKeyError`
- `InvalidMessengerInputError`, with structured `field`

See [Facebook Messenger setup](/docs/ecosystem/channels/messenger/) for Page
configuration and project-owned Graph API composition.
