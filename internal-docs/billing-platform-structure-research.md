# Billing and plan structure — how comparable platforms split free from paid

Status: **research.** Written 2026-08-26.
Purpose: decide how bapX separates a free BYOK tier on `platform.bapx.in` from a
paid agent tier on `agents.bapx.in`, and how storage is sold in INR.

Companion to `cloud-agent-platform-research.md` (connectors, sandboxes, hosting).

---

## 1. Verified bapX state, 2026-08-26

Grounded in the code, not in the published copy. Commands run at `44e85247`.

| Claim | Verified how | Result |
| --- | --- | --- |
| Pricing is already INR | `grep -rnE 'USD\|\$[0-9]+' apps/www/src` | **No USD anywhere.** `pricing.astro` and `docs/platform/billing.md` are ₹-only |
| Published price | `pricing.astro:65,79` | ₹500/month incl. 5 GB; **₹100/GB/month** beyond, to 100 GB |
| Any plan enforcement | `grep -rniE 'subscription\|entitlement\|quota\|paid\|storageLimit'` over `apps/www/src/server/*.mjs` and `server.mjs` | **Zero matches.** No entitlement concept exists |
| Storage accounting | same sweep | **Does not exist.** Nothing measures a workspace's bytes |
| Signup cost | `platform-store.mjs` | Free. No payment step |
| Isolated workspace at signup | `ensureUserWorkspace()`, `platform-store.mjs:120-150` | **Already provisioned**: `users/<username>/<business>/` with `OKF.md`, `index.yaml`, `map.mmd`, `logos/`, `projects/`, `collections/`, `schemas/` |
| Credential isolation | `connector-store.mjs:103`, `api-gateway.mjs:47` | **Logical only.** All accounts share `data/platform/collections/{connectors,api-keys}.json`, filtered by `accountId` |
| Razorpay | `billing.md` | Named as *planned*. Zero implementation |

Two conclusions follow immediately:

1. **The "make it an Indian product" work is already done in the copy.** There is
   no dollar pricing to convert. What is missing is the *machinery*, not the
   currency.
2. **The free tier already works by accident.** Signup, workspace provisioning,
   API-key issuance and connector storage are all ungated — because no gate
   exists anywhere, not because a free tier was designed. That is a different
   thing from having one, and it is why an abuse ceiling is the real work.

## 2. OpenRouter — the closest analogue to the free tier

OpenRouter is the reference for "free BYOK gateway", which is exactly the
`platform.bapx.in` proposition: the customer brings provider credentials, we
route, the provider bills them.

- BYOK exists so callers are "billed by the underlying provider instead of by
  OpenRouter", across 60+ inference providers.
- Provider keys are encrypted and managed in a workspace BYOK settings surface.
- **BYOK is free only up to a ceiling.** As of mid-August 2026 the allowance is
  measured as **$25,000/month of list-price inference**, then **5%** of what the
  same call would have cost; Enterprise raises the allowance to $200,000/month.
  This replaced an earlier request-count allowance (1M free BYOK requests/month).

**The transferable lesson is the ceiling, and the unit it is measured in.**
OpenRouter deliberately moved *off* request counts and onto inference value,
because a request is not a unit of cost — one 200k-token call and one 20-token
call are the same request and differ by four orders of magnitude in what they
consume. A bapX free tier metered in requests would be gameable on day one.

bapX's free tier is cheaper to run than OpenRouter's, because we proxy rather
than serve inference: our marginal cost is bandwidth and the `apps-www` event
loop, not tokens. So the ceiling exists to bound **abuse**, not to recover cost —
which argues for a rate/concurrency ceiling plus a key cap, not a value ceiling.

## 3. MiniMax — two billing systems, two key types

MiniMax runs three access paths: the Agent web platform, pay-as-you-go API, and a
separate Coding Plan subscription. Prices as listed on 2026-08-13: Plus $20/mo,
Max $50/mo, with an Ultra tier above.

The structurally important part is that MiniMax operates **two distinct billing
systems**: Open Platform API key (pay-as-you-go) and Token Plan / Subscription
key (quota). Which budget applies is determined by *which key type* is used, and
reviewers repeatedly flag that this distinction is the main source of confusion —
API access needs no subscription, while the Coding Plan is a separate optional
layer on top.

**This is precisely the bapX split**, and it validates the shape: a free API key
that reaches `/v1` with the customer's own provider credentials, and a separate
paid subscription that unlocks agents. It also carries the warning: if the two
are not visibly distinct in the UI, customers will not understand why their API
key works but the agent menu is locked. The upgrade prompt in the agent menu is
not a nag — it is the boundary made legible, and it should say what the key
already entitles them to.

## 4. Perplexity — a tier ladder with per-tier quota multipliers

Perplexity Enterprise Pro is $40/seat/month ($400/year); Enterprise Max is
$325/seat/month ($3,250/year), confirmed on Perplexity's pricing FAQ as of
2026-07-17. Max adds SCIM, audit logs, configurable retention, Model Council, far
higher file limits, and **30× the monthly Computer credits** of Pro.
Organisations can **mix Pro and Max seats in one org**.

Two transferable points:

- **A tier is a bundle, not one number.** Each rung raises several limits at
  once. A bapX storage ladder that raises *only* GB is leaving the mechanism
  half-used — the rungs should also carry agent concurrency and hosted-project
  count, which are the limits that actually cost us CPU and RAM on a 2-vCPU box.
- **Mixed entitlement within one org is expected.** bapX's account → business →
  project hierarchy should attach entitlement at the level that gets billed, and
  not assume one plan covers every business an account owns.

## 5. Razorpay decides the shape of the storage ladder

This is the finding that settles the metered-vs-ladder question.

Razorpay Subscriptions is **plan-based**: a plan fixes price and billing
schedule, a subscription binds a customer to a plan, and Razorpay charges on
that schedule. Upgrades and downgrades are supported, and:

- Mid-cycle plan changes **prorate** — Razorpay raises an invoice for the
  difference on upgrade and refunds on downgrade.
- A prorated difference must be **at least 50 currency subunits** (₹0.50).
- `subscription.updated` fires on change; subscription webhook payloads carry the
  subscription entity, plus a payment entity when a payment was attempted.
- Plan changes **can be scheduled for the end of the billing period** to avoid
  proration entirely.

**Therefore the currently published ₹100/GB/month metered model is the wrong fit
for the payment rail we have already chosen.** Metered per-GB billing on
Razorpay Subscriptions means either a plan per possible GB count, or usage-based
invoicing outside the subscription. A discrete ladder — 5 / 20 / 50 / 100 GB —
maps one-to-one onto Razorpay plans, makes upgrade a single `update-subscription`
call with proration handled by Razorpay, and makes downgrade schedulable at cycle
end.

The requested change is not a pricing preference. It is the model the rail
supports.

## 6. What bapX should do

1. **Name the free tier and bound it.** Signup, isolated workspace, API keys,
   connectors and `/v1` are already free; the work is a per-account key cap, rate
   and concurrency limits, and an unauthenticated-work ceiling — not a value
   meter. (OpenRouter's unit lesson: never count requests.)
2. **Replace metered storage with a four-rung ladder** and create one Razorpay
   plan per rung. Selection happens *before* checkout, from the agent menu.
3. **Make each rung a bundle**, not just GB — carry agent concurrency and hosted
   project count, which are what the VPS actually runs out of.
4. **Gate `agents.bapx.in` on entitlement**, checked server-side, with the
   5 GB rung as the floor. The gate must read from a stored entitlement that
   webhooks update, never from a client claim.
5. **Give storage a meter before selling it by the gigabyte.** Nothing counts
   bytes today, so no rung is enforceable. This is a prerequisite, not a
   follow-up.
6. **Move credentials to per-account files.** One shared `api-keys.json` that is
   rewritten on every issuance and scanned on every verification is both a
   tenancy smell and the throughput ceiling for the free tier.

## 7. Sources

Retrieved 2026-08-26 unless noted.

- [BYOK — Bring Your Own Keys to OpenRouter](https://openrouter.ai/docs/guides/overview/auth/byok) — OpenRouter (vendor primary)
- [BYOK platform fee update](https://openrouter.ai/blog/announcements/1-million-free-byok-requests-per-month/) — OpenRouter (vendor primary)
- [OpenRouter free tier: rate limits, models, BYOK](https://klymentiev.com/blog/openrouter-free-tier) — Dmytro Klymentiev (secondary)
- [MiniMax Agent: features, pricing](https://minimax-ai.chat/models/minimax-agent/) and [MiniMax pricing](https://minimax-ai.chat/pricing/) — secondary; Token Plan prices as listed 2026-08-13
- [MiniMax API pricing, token plans, rate limits](https://flowith.io/blog/minimax-api-pricing-tokens-concurrency/) — Flowith (secondary)
- [Perplexity enterprise pricing](https://coworker.ai/blog/perplexity-enterprise-pricing) — Coworker AI (secondary; cites Perplexity pricing FAQ of 2026-07-17)
- [Subscriptions](https://razorpay.com/docs/payments/subscriptions/) — Razorpay (vendor primary)
- [Update a subscription](https://razorpay.com/docs/payments/subscriptions/update/) — Razorpay (vendor primary)
- [Subscriptions webhook events](https://razorpay.com/docs/webhooks/payloads/subscriptions/) — Razorpay (vendor primary)

Vendor pricing pages were not directly reachable from this host for MiniMax and
Perplexity; those figures come from secondary summaries and carry their retrieval
dates above. Razorpay and OpenRouter behaviour is from vendor documentation.
