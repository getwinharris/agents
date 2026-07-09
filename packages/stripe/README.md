# `@bapX/stripe`

Verified Stripe webhook ingress for Flue.

The package exposes one fixed `POST /webhook` route. It uses a project-owned
Stripe client to verify exact request bytes through the official SDK before
calling application code.

```ts
import Stripe from 'stripe';
import { createStripeChannel } from '@bapX/stripe';

export const client = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  httpClient: Stripe.createFetchHttpClient(),
});

export const channel = createStripeChannel({
  client,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,

  // Path: /channels/stripe/webhook
  webhook({ event }) {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        // Dispatch application work.
        return;
    }
  },
});
```

Place this export in `channels/stripe.ts`. Flue discovers it and serves
`POST /channels/stripe/webhook` relative to the `flue()` mount.

Use `eventPayload: 'thin'` to receive verified API v2 event notifications
instead of snapshot events. Outbound API calls, tools, credentials,
deduplication, and persistence remain application-owned.

Stripe's event unions follow the installed SDK version. Flue forwards verified
future types; use `event.type as string` until the project upgrades Stripe.
