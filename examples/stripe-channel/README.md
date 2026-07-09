# Stripe channel example

This example receives verified Stripe snapshot events at
`/channels/stripe/webhook`, dispatches completed Checkout sessions to a billing
agent, and exports the application-owned official Stripe `client`.

Required environment variables:

```sh
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

Configure a Stripe event destination to send
`checkout.session.completed` and
`checkout.session.async_payment_succeeded` events to:

```txt
POST /channels/stripe/webhook
```

Stripe signs the exact request body. The route must receive the unconsumed body
and its `Stripe-Signature` header. The channel uses the official SDK's async
verification path so the same implementation runs with Node crypto and
Cloudflare Workers Web Crypto.

The handler groups the two completed Checkout event types, requires a customer
on the Checkout Session, and dispatches one agent instance for that customer.
Stripe does not provide a universal conversation identity, so this
customer-scoped instance id is application policy rather than a channel
primitive. Connected-account and organization context are retained when
present so the outbound lookup is scoped to the verified event.

The `getCustomerSummary()` tool is deliberately narrow. The verified webhook
binds the customer and account/context before the model runs; the model cannot
choose another customer, account, credential, or API operation.

Stripe can retry deliveries and does not guarantee ordering. Applications that
require exactly-once effects must claim `event.id` in durable application
storage before dispatch. The example does not implement webhook registration,
OAuth, secret rotation, deduplication, or persistence.

This example uses snapshot events. Thin event notifications are a separate
Stripe payload mode and should be configured explicitly when the application
needs their fetch-on-demand behavior. Specialized synchronous flows such as
real-time Issuing authorization have stricter response semantics and are not
represented by this asynchronous Checkout example.

Node and workerd tests execute the real Stripe Fetch client against original
local responses without contacting Stripe. The workerd suite runs with Bapx's
required `nodejs_compat` configuration.

The channel module imports the agent and the agent imports the channel helpers.
This cycle is safe because imported bindings are read only inside the webhook
callback and agent initializer, after module evaluation.

This agent is intentionally dispatch-only. Any direct agent route must
independently authorize a caller-selected instance id before deriving a Stripe
tool from it.
