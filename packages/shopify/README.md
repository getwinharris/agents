# `@bapX/shopify`

Verified Shopify JSON webhook ingress for Bapx.

The package exposes one fixed `POST /webhook` route and verifies Shopify's
base64 HMAC-SHA256 over the exact request bytes before parsing the payload or
calling application code.

```ts
import { createShopifyChannel } from '@bapX/shopify';

export const channel = createShopifyChannel({
  clientSecret: process.env.SHOPIFY_CLIENT_SECRET!,

  // Path: /channels/shopify/webhook
  webhook({ c, payload }) {
    if (c.req.header('x-shopify-topic') === 'orders/create') {
      // Validate the topic fields you consume, then dispatch application work.
    }
  },
});
```

Place this export in `channels/shopify.ts`. Bapx discovers it and serves
`POST /channels/shopify/webhook` relative to the `bapX()` mount.

The callback receives `{ c, payload, rawBody }`: the Hono context, Shopify's
parsed JSON body, and the exact verified UTF-8 body. Delivery metadata is read
from the provider's native headers through `c`, for example
`c.req.header('x-shopify-topic')` and `c.req.header('x-shopify-shop-domain')`.
The channel verifies the body signature only; it does not curate or require any
delivery header. Payload fields vary by topic, API version, and subscription
field selection, so the package does not publish a false closed payload union.
Numeric literals outside JavaScript's safe range are represented as strings
rather than silently rounding Shopify's 64-bit identifiers.

Returning no value or a JSON-compatible value acknowledges the delivery with
`200`. A returned Hono or Fetch `Response` passes through unchanged. Shopify
retries non-2xx responses. Shopify allows five seconds for the complete
delivery, so admit durable work promptly — dispatch and return — rather than
racing a callback against a timer, which cannot cancel work already running.

Shopify does not sign a timestamp or provide a replay window, does not
guarantee ordering, and can redeliver events. Persist
`c.req.header('x-shopify-webhook-id')` for application-owned deduplication.
Shopify's HMAC covers the body rather than the delivery headers; header
metadata is routing context, not an authorization capability.

App installation, OAuth, access-token storage, webhook registration, compliance
business workflows, deduplication, and outbound Admin API behavior remain
application-owned.
