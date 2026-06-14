# `@flue/salesforce-marketing-cloud`

Verified Salesforce Marketing Cloud Engagement Event Notification Service
(ENS) ingress for Flue.

```ts
import { createSalesforceMarketingCloudChannel } from '@flue/salesforce-marketing-cloud';

export const channel = createSalesforceMarketingCloudChannel({
  signatureKey: process.env.SALESFORCE_MARKETING_CLOUD_SIGNATURE_KEY!,
  callbackId: process.env.SALESFORCE_MARKETING_CLOUD_CALLBACK_ID,

  // Path: /channels/salesforce-marketing-cloud/events
  events({ batch }) {
    for (const event of batch.events) {
      console.log(event.eventCategoryType, event.timestampUTC, event.raw);
    }
  },
});
```

Place this export in `channels/salesforce-marketing-cloud.ts`. Flue discovers
it and serves `POST /channels/salesforce-marketing-cloud/events` relative to
the `flue()` mount.

Signed notifications require `x-sfmc-ens-signature`, a base64 HMAC-SHA256
digest over the exact request bytes. `signatureKey` is the opaque callback key
used directly as UTF-8 HMAC material; do not base64-decode it. Verification
happens before UTF-8 decoding or JSON parsing.

The callback receives an ordered, nonempty batch of at most 1000 events.
Common validation requires a nonempty `eventCategoryType` and nonnegative
safe-integer `timestampUTC`. `compositeId`, `mid`, `eid`, and `info` are
optional and event-family dependent. Each event preserves the complete
provider object in `raw`; optional fields with family-specific shapes remain
there even when they are not projected onto the normalized event. The batch
exposes the exact decoded `rawBody`. ENS has no universal delivery or
conversation id; `compositeId` is deprecated for transactional email.

An optional `verification` handler enables the unsigned callback setup shape
containing exactly `callbackId` and `verificationKey`. The application owns
calling `/platform/v1/ens-verify` and all callback registration, OAuth, token,
and subscription lifecycle behavior. Without the handler, unsigned requests
are rejected.

Returning no value or a JSON-compatible value produces `200`. A returned Hono
or Fetch `Response` passes through unchanged. ENS acknowledges only statuses
`200` through `204`. Complete processing defaults to a 2500 ms deadline and
cannot be configured higher; channel failures and timeouts return `500`.

ENS delivery is at least once and retries can continue for up to seven days.
Deduplication, persistence, family-specific validation, outbound API clients,
and agent routing remain application-owned.
