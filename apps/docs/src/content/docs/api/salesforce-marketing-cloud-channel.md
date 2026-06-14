---
title: Salesforce Marketing Cloud Channel API
description: Reference for Marketing Cloud Engagement ENS ingress from @flue/salesforce-marketing-cloud.
lastReviewedAt: 2026-06-13
---

Import from `@flue/salesforce-marketing-cloud`.

## Exports

```ts
export {
  createSalesforceMarketingCloudChannel,
  type ChannelRoute,
  type JsonObject,
  type JsonValue,
  type SalesforceMarketingCloudBatch,
  type SalesforceMarketingCloudChannel,
  type SalesforceMarketingCloudChannelOptions,
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
  signatureKey?: string;
  callbackId?: string;
  bodyLimit?: number;
  handlerTimeoutMs?: number;
  verification?(input: SalesforceMarketingCloudVerificationHandlerInput<E>): void | Promise<void>;
  events(
    input: SalesforceMarketingCloudEventsHandlerInput<E>,
  ): SalesforceMarketingCloudHandlerResult;
}
```

| Field              | Description                                                                 |
| ------------------ | --------------------------------------------------------------------------- |
| `signatureKey`     | Opaque callback HMAC key. Used directly as UTF-8; it is not base64-decoded. |
| `callbackId`       | Optional expected id for unsigned callback verification.                    |
| `bodyLimit`        | Maximum request-body size in bytes. Defaults to 1 MiB.                      |
| `handlerTimeoutMs` | Complete route deadline. Defaults to 2500 ms; maximum 2500 ms.              |
| `verification`     | Optional handler enabling the unsigned setup challenge.                     |
| `events`           | Receives every authenticated, structurally valid ENS batch.                 |

`signatureKey`, when provided, must be nonempty. Signed requests receive `401`
when no key is configured. `callbackId` must be a nonempty trimmed string.
`bodyLimit` must be a positive safe integer. `handlerTimeoutMs` must be a safe
integer from 1 through 2500.

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
limit, exact-body HMAC, UTF-8, JSON, batch, and common event validation pass.

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

```ts
interface SalesforceMarketingCloudEvent {
  eventCategoryType: string;
  timestampUTC: number;
  compositeId?: string;
  mid?: number | string;
  eid?: number | string;
  info?: JsonObject;
  raw: JsonObject;
}
```

| Field               | Constraint or meaning                                                      |
| ------------------- | -------------------------------------------------------------------------- |
| `eventCategoryType` | Nonempty open ENS event taxonomy string.                                   |
| `timestampUTC`      | Nonnegative safe-integer provider UTC epoch timestamp.                     |
| `compositeId`       | Optional family-dependent tracking id; deprecated for transactional email. |
| `mid`               | Optional positive safe integer or nonempty string business-unit id.        |
| `eid`               | Optional positive safe integer or nonempty string enterprise id.           |
| `info`              | Optional family-dependent JSON object.                                     |
| `raw`               | Complete parsed provider event, including unnormalized future fields.      |

The package validates only common ENS fields. Event families can place useful
data outside `info`, omit any optional field, give an optional field a
family-specific shape, or add future fields. An optional field is projected
onto the normalized event only when it matches the type above; the complete
value remains in `raw`. Applications must validate every family-specific field
they consume.

ENS does not provide a universal delivery id, resource id, actor id, or
conversation id. The package does not construct canonical identity from these
optional fields.

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

A thrown handler, unsupported result, or complete-route timeout produces an
empty `500`. ENS acknowledges only statuses `200` through `204`; a passed
through status outside that range is not an acknowledgment.

`handlerTimeoutMs` covers body receipt, verification, parsing, and the
application handler. If processing exhausts the deadline before a handler
starts, the handler is not invoked. Timed-out work already in progress is not
cancelled and may continue after the `500` response.

## JSON types

```ts
type JsonObject = { [key: string]: JsonValue };
```

Provider objects and handler JSON results accept finite numbers only. Objects
must be ordinary JSON objects; unsupported or cyclic handler values produce
`500`.

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
[Salesforce Marketing Cloud setup](/docs/guide/channels/salesforce-marketing-cloud/)
for callback verification, a tenant-bound Fetch client, tool binding, and
Node/workerd testing guidance.
