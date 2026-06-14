---
title: Salesforce Marketing Cloud Channel API
description: Reference for Marketing Cloud Engagement ENS ingress from @flue/salesforce-marketing-cloud.
---

Import from `@flue/salesforce-marketing-cloud`.

## Exports

```ts
export {
  createSalesforceMarketingCloudChannel,
  type ChannelRoute,
  type JsonValue,
  type SalesforceMarketingCloudBatch,
  type SalesforceMarketingCloudChannel,
  type SalesforceMarketingCloudChannelOptions,
  type SalesforceMarketingCloudComposite,
  type SalesforceMarketingCloudEvent,
  type SalesforceMarketingCloudEventsHandlerInput,
  type SalesforceMarketingCloudHandlerResult,
  type SalesforceMarketingCloudVerification,
  type SalesforceMarketingCloudVerificationHandlerInput,
};
```

## `createSalesforceMarketingCloudChannel()`

```ts
function createSalesforceMarketingCloudChannel<E extends Env = Env>(
  options: SalesforceMarketingCloudChannelOptions<E>,
): SalesforceMarketingCloudChannel<E>;
```

Creates one Marketing Cloud Engagement Event Notification Service channel.

## `SalesforceMarketingCloudChannelOptions`

```ts
interface SalesforceMarketingCloudChannelOptions<E extends Env = Env> {
  signatureKey: string;
  callbackId?: string;
  bodyLimit?: number;
  verification?(input: SalesforceMarketingCloudVerificationHandlerInput<E>): void | Promise<void>;
  events(
    input: SalesforceMarketingCloudEventsHandlerInput<E>,
  ): SalesforceMarketingCloudHandlerResult;
}
```

| Field          | Description                                                                 |
| -------------- | --------------------------------------------------------------------------- |
| `signatureKey` | Required opaque callback HMAC key. Used directly as UTF-8; not base64-decoded. |
| `callbackId`   | Optional expected id for unsigned callback verification.                    |
| `bodyLimit`    | Maximum request-body size in bytes. Defaults to 1 MiB.                      |
| `verification` | Optional handler enabling the unsigned setup challenge.                     |
| `events`       | Receives every authenticated, structurally valid ENS batch.                 |

`signatureKey` is required and must be a nonempty string. `callbackId` must be a
nonempty trimmed string. `bodyLimit` must be a positive safe integer.

## Routes

```ts
interface SalesforceMarketingCloudChannel<E extends Env = Env> {
  readonly routes: readonly ChannelRoute<E>[];
}
```

`routes` contains one `POST /events` declaration. A file named
`channels/salesforce-marketing-cloud.ts` is served at:

```txt
POST /channels/salesforce-marketing-cloud/events
```

The path is relative to the `flue()` mount.

## Event handler input

```ts
interface SalesforceMarketingCloudEventsHandlerInput<E extends Env = Env> {
  c: Context<E>;
  batch: SalesforceMarketingCloudBatch;
}
```

`c` is the authentic Hono context. `events` runs only after content type, body
limit, exact-body HMAC, UTF-8, JSON, and batch-shape validation pass.

## `SalesforceMarketingCloudBatch`

```ts
interface SalesforceMarketingCloudBatch {
  events: SalesforceMarketingCloudEvent[];
  rawBody: string;
}
```

`events` preserves provider order. A signed batch must contain 1 through 1000
events. `rawBody` is the exact UTF-8 request body decoded only after successful
signature verification.

## `SalesforceMarketingCloudEvent`

Events are passed through as Marketing Cloud delivers them, with the provider's
own field names and nesting. There is no `raw` wrapper and no field projection.

```ts
interface SalesforceMarketingCloudComposite {
  jobId?: string;
  batchId?: string;
  listId?: string;
  [key: string]: unknown;
}

interface SalesforceMarketingCloudEvent {
  eventCategoryType: string;
  timestampUTC: number;
  compositeId?: string;
  composite?: SalesforceMarketingCloudComposite;
  definitionKey?: string;
  definitionId?: string;
  mid?: number | string;
  eid?: number | string;
  info?: { [key: string]: unknown };
  [key: string]: unknown;
}
```

| Field               | Constraint or meaning                                                       |
| ------------------- | --------------------------------------------------------------------------- |
| `eventCategoryType` | Nonempty open ENS event taxonomy string. The only field ingress validates.  |
| `timestampUTC`      | Provider UTC epoch timestamp in milliseconds. Forwarded as delivered; not validated. |
| `compositeId`       | Optional flattened tracking id; deprecated for transactional email.         |
| `composite`         | Optional broken-down tracking id present on email families.                 |
| `definitionKey`     | Optional Send Definition customer key (transactional sent events).          |
| `definitionId`      | Optional Send Definition id (transactional sent events).                    |
| `mid`               | Optional business-unit id. Delivered as `number` on some families, `string` on others. |
| `eid`               | Optional enterprise id. Delivered as `number` on some families, `string` on others. |
| `info`              | Optional family-specific details object.                                    |
| `[key: string]`     | Any authenticated field this type does not model, forwarded unchanged.      |

Ingress validates only that each event is a JSON object carrying a nonempty
`eventCategoryType`; one malformed item does not reject the whole batch beyond
that. Every other field — including `timestampUTC`, whose representation varies
across families — is forwarded exactly as ENS delivered it. The open index
signature carries fields outside the modeled set, so narrow on
`eventCategoryType` and validate every family-specific field you consume.

ENS does not provide a universal delivery id, resource id, actor id, or
conversation id. The package does not construct canonical identity from these
fields.

## Verification handler input

```ts
interface SalesforceMarketingCloudVerificationHandlerInput<E extends Env = Env> {
  c: Context<E>;
  verification: SalesforceMarketingCloudVerification;
}

interface SalesforceMarketingCloudVerification {
  callbackId: string;
  verificationKey: string;
}
```

The unsigned setup body must be a JSON object with exactly `callbackId` and
`verificationKey`, both nonempty strings. Additional or missing fields are
rejected.

Unsigned requests are accepted only when `verification` is configured. A
configured `callbackId` mismatch receives `403`. After the handler completes,
Flue returns an empty `200`. The application owns calling
`POST /platform/v1/ens-verify`, setup authorization, OAuth, and callback
lifecycle.

Without a verification handler, unsigned requests receive `401`.

## Signature verification

Signed requests require:

```txt
Content-Type: application/json
x-sfmc-ens-signature: <base64 HMAC-SHA256 digest>
```

Marketing Cloud computes HMAC-SHA256 over the exact request bytes. The
`x-sfmc-ens-signature` value is base64-decoded and must contain a 32-byte
digest. `signatureKey` is an opaque string used directly as UTF-8 HMAC key
material and must not be base64-decoded.

Verification occurs before UTF-8 decoding or JSON parsing. The protocol
provides no signed timestamp or package-enforced replay window.

Unsupported media types receive `415`; malformed content length, UTF-8, JSON,
batches, or events receive `400`; oversized bodies receive `413`; missing,
malformed, or changed signatures receive `401`; and configured callback-id
mismatches receive `403`.

## Handler result

```ts
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type SalesforceMarketingCloudHandlerResult =
  | undefined
  | JsonValue
  | Response
  | Promise<undefined | JsonValue | Response>;
```

Returning nothing produces an empty `200`. A JSON-compatible value becomes a
JSON response with status `200`. A normal Hono or Fetch `Response` passes
through unchanged.

A thrown handler or unsupported (non-serializable) result produces an empty
`500`. ENS acknowledges only statuses `200` through `204`; a passed-through
status outside that range is not an acknowledgment.

Flue imposes no route timeout. The handler is awaited and its result serialized.
The only ENS deadline is at setup: the unsigned verification POST must be
answered `200` within 30 seconds or callback creation fails. Because delivery is
at least once with retries for up to seven days, admit durable work quickly —
dispatch, then return — rather than blocking the handler on slow work.

## Delivery and application boundary

ENS delivery is at least once and retries can continue for up to seven days.
This package does not supply a deduplication key, persist events, or suppress
duplicates. Applications must select a family-appropriate key and make
non-idempotent processing durable.

Callback registration, verification API calls, OAuth, token storage and
refresh, subscription lifecycle, tenant selection, outbound clients,
deduplication, persistence, and agent routing policy remain application
concerns.

`@flue/salesforce-marketing-cloud` depends only on Hono and standards-based Web
Crypto. The verification path executes in Node and workerd.

See
[Salesforce Marketing Cloud setup](/docs/ecosystem/channels/salesforce-marketing-cloud/)
for callback verification, a tenant-bound Fetch client, tool binding, and
Node/workerd testing guidance.
