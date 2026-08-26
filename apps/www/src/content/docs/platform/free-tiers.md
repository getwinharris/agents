---
title: Free tiers and model capacity
description: Connect your own provider accounts — including their free tiers — and use them across every bapX agent through one endpoint.
---

:::caution[Not open to customers yet]
This page describes the intended capacity model. The customer gateway at
`api.bapx.in` is **not open**, and runtime resolution of a connected provider's
credential is unfinished — see [Platform API](/docs/platform/api/). Connecting a
credential today stores it; it does not yet make a model callable through the
gateway. Do not configure production secrets against this workflow until the
gateway ships.
:::

Most AI providers offer some form of free access: a recurring monthly quota, a keyless endpoint, a signup grant, or rate-limited uncapped use. Connecting several of them gives your business real working capacity at no model cost.

bapX aggregates the providers **you** connect into one endpoint, and routes each request to a model that is actually available to you.

## How capacity works here

**You connect your own provider accounts.** bapX does not pool its accounts and resell them to you. Every call runs on your credential, billed to you, under the agreement you accepted with that provider.

This matters beyond billing. Several providers permit a single-tenant proxy but **explicitly prohibit reselling API access or running a multi-tenant proxy on pooled credentials**. Routing your own credentials keeps your usage inside terms you already agreed to, rather than inside terms someone else agreed to on your behalf.

The practical consequence: **your capacity is the sum of the free tiers you connect.** Connect one provider and you get one provider's quota. Connect eight and the router has eight pools to fall back across.

## Connecting a provider

1. Open **Connectors** on [platform.bapx.in](https://platform.bapx.in/).
2. Pick a provider and choose **Connect**.
3. Paste the credential from that provider's console.

The credential is encrypted before storage and never shown again — not in the UI, not to an agent, not in an error message. You can replace it at any time by connecting again, or remove it with **Disconnect**, which takes effect immediately.

Once the gateway ships, `GET /v1/models` will return exactly the models reachable through what you have connected, and a model missing from that list will not be callable. Until then the endpoint is not open — see the notice above.

## Choosing providers

Free access varies a great deal in shape. When evaluating one, check:

- **Quota shape** — recurring monthly, one-time signup grant, or uncapped-but-rate-limited.
- **Credential requirement** — some are keyless, most need an account, a few need a card or KYC.
- **Terms** — some free tiers are explicitly **non-commercial**, and some prohibit proxying. A free tier you cannot legally use for your business is not capacity.
- **Data handling** — free tiers more often train on submitted data. Check before sending customer information.

That last pair is not boilerplate. Read the terms of any provider you connect for business work, because the obligation sits with you as the account holder.

## Automatic routing and fallback

Once several providers are connected, the router can pick per request rather than pinning one model:

- Exhausted quota on one provider falls back to the next with capacity.
- A provider outage routes around itself.
- Requests can be matched to a model suited to the task rather than one default for everything.

Address models as `<provider>/<model>` when you want a specific one — the provider prefix is what routes the call.

## Cost boundary

bapX charges for the workspace, not for tokens: **₹500/month including 5 GB**, additional storage at **₹100/GB/month** up to 100 GB. Model usage is billed by your providers directly to you.

So a business running entirely on connected free tiers pays bapX its subscription and pays nothing for model calls — while a business on paid provider accounts pays those providers directly, at their rates, with no bapX margin on top.

## See also

- [Platform API](/docs/platform/api/) — the endpoint, keys, and supported operations
- [Ecosystem](/docs/ecosystem/) — the full connector catalog
