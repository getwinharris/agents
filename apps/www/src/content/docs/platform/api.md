---
title: Platform API
description: The bapX API plane — one OpenAI-compatible endpoint, served today on operator-run capacity while per-business credential routing is built.
---

The bapX API plane gives a business one OpenAI-compatible endpoint across many AI providers, reached with a bapX-issued key.

## Status

The gateway is **served and key-gated**: `https://api.bapx.in/v1` and
`https://api.bapx.in/mcp` answer, and reject an unknown key with `401`.

:::caution[Per-business credentials are not wired yet]
Requests are forwarded to an **operator-run** API plane using its own credential.
bapX does not yet resolve a call against the providers your business has
connected on Platform. Connecting a provider stores the credential; it does not
yet change what `/v1` calls or what `/v1/models` returns.

Everything in *Bring your own credentials* below describes the target, not
today's behaviour. Read it as the contract being built toward.
:::

What is decided and will not change:

- The endpoint is **OpenAI-compatible**. Existing OpenAI SDK code works by changing the base URL and key.
- Access is **per business**, scoped by an issued bapX API key.
- Provider credentials are **yours** — see [Bring your own credentials](#bring-your-own-credentials) below, which is a product boundary, not a limitation we intend to remove.

Key issuance, quotas, and usage reporting go live with the gateway.

## Base URL

```text
https://api.bapx.in/v1
```

Requests authenticate with a bapX-issued key in the standard `Authorization` header:

```bash
curl https://api.bapx.in/v1/chat/completions \
  -H "Authorization: Bearer $BAPX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-4o-mini",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

Because the surface is OpenAI-compatible, the official SDKs work directly:

```ts
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.BAPX_API_KEY,
  baseURL: 'https://api.bapx.in/v1',
});
```

## Supported operations

| Operation | Path |
| --- | --- |
| Chat completions | `POST /v1/chat/completions` |
| List models | `GET /v1/models` |

`GET /v1/models` currently returns the plane's whole catalogue. Once per-business routing ships it will return only the models reachable through the providers your business has connected; write integrations against that narrower contract rather than assuming the full list stays available.

## Bring your own credentials

bapX does not intend to resell model capacity. The target is that every call is
billed by your provider, to your account, under your own agreement with that
provider. **That is not how the plane behaves today** — see the status note
above.

This matters for more than pricing. Several providers' terms permit a self-hosted single-user proxy but **prohibit reselling API access or operating a multi-tenant proxy on pooled credentials**. Routing your own credentials keeps your usage inside the agreement you already accepted, rather than inside one bapX made on your behalf.

Practically, once routing ships:

- Add provider credentials under **Connectors** on [platform.bapx.in](https://platform.bapx.in/).
- Credentials are stored per business and are never shared across businesses. **This part is already true** — see [Connectors](/docs/platform/connectors/).
- Agents receive only the connections authorized for their business workspace.
- Revoking a provider connection will drop those models from `/v1/models`.

Only the storage guarantee holds today. The routing, scoping, and revocation
behaviour above is pending.

## Model naming

Models are addressed as `<provider>/<model>`, for example:

```text
openai/gpt-4o-mini
anthropic/claude-sonnet-4-5
google/gemini-2.5-flash
```

The provider prefix is what routes the call, so it is required even when a model name is globally unique.

## Relationship to MCP

The API plane is for **model calls**. The [MCP gateway](/docs/mcp/overview/) is for **tools, resources, and workspace context**. They are separate surfaces with separate authorization, and an API key does not grant MCP access.

## Attribution

The bapX API plane is built on [OmniRoute](https://github.com/diegosouzapw/OmniRoute), an MIT-licensed AI gateway (© 2026 diegosouzapw). bapX operates it as the routing layer beneath the gateway described here; the customer-facing contract on this page is bapX's own and is the supported surface.

## Key scopes

A **Models key** (`bapx_sk_`) is the only kind accepted here. An **MCP key**
(`bapx_mk_`) is refused with `403 insufficient_scope` — it belongs to
[MCP access](/docs/platform/mcp/).

Issuing a key for one surface never grants the other. A Models key spends
provider credit; an MCP key lets an external agent act as your business.
