# `@bapX/salesforce`

Verified Salesforce Marketing Cloud Engagement Event Notification Service
(ENS) ingress for Bapx.

```ts
import { createSalesforceMarketingCloudChannel } from '@bapX/salesforce';

export const channel = createSalesforceMarketingCloudChannel({
  signatureKey: process.env.SALESFORCE_MARKETING_CLOUD_SIGNATURE_KEY!,
  callbackId: process.env.SALESFORCE_MARKETING_CLOUD_CALLBACK_ID,

  // Path: /channels/salesforce-marketing-cloud/events
  events({ batch }) {
    for (const event of batch.events) {
      console.log(event.eventCategoryType, event.timestampUTC, event.info);
    }
  },
});
```

Place this export in `channels/salesforce-marketing-cloud.ts`. Bapx discovers
it and serves `POST /channels/salesforce-marketing-cloud/events` relative to
the `bapX()` mount.

`signatureKey` is required. Signed notifications require `x-sfmc-ens-signature`,
a base64 HMAC-SHA256 digest over the exact request bytes. `signatureKey` is the
opaque callback key used directly as UTF-8 HMAC material; do not base64-decode
it. Verification happens before UTF-8 decoding or JSON parsing.

The callback receives an ordered, nonempty batch of at most 1000 events. Each
event is passed through with Marketing Cloud's own field names and nesting —
there is no `raw` wrapper and no field projection. Ingress requires only a
nonempty `eventCategoryType`; every other field, including `timestampUTC`, is
forwarded exactly as ENS delivered it. Fields not validated by ingress —
including `timestampUTC`, `composite`, `compositeId`, `definitionKey`,
`definitionId`, `info`, `mid`, and `eid` — are optional `unknown`; narrow them
according to the event family before use. An open index signature forwards any
authenticated field
this type does not model, so narrow on `eventCategoryType` and read the family
fields you expect. The batch also exposes the exact decoded `rawBody`. ENS has no
universal delivery or conversation id; `compositeId` is deprecated for
transactional email.

An optional `verification` handler enables the unsigned callback setup shape
containing exactly `callbackId` and `verificationKey`. The application owns
calling `/platform/v1/ens-verify` and all callback registration, OAuth, token,
and subscription lifecycle behavior. Without the handler, unsigned requests
are rejected.

Returning no value or a JSON-compatible value produces `200`. A returned Hono
or Fetch `Response` passes through unchanged. ENS acknowledges only statuses
`200` through `204`; channel failures and non-serializable results return `500`.

Bapx imposes no route timeout: the handler is awaited and its result serialized.
The only ENS deadline is at setup — the unsigned verification POST must be
answered `200` within 30 seconds or callback creation fails. Because ENS delivers
at least once and retries unacknowledged batches for up to seven days, admit
durable work quickly (dispatch, then return) and make non-idempotent processing
idempotent. Deduplication, persistence, family-specific validation, outbound API
clients, and agent routing remain application-owned.
