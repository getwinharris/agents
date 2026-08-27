---
title: Platform API
description: The bapX API plane — one OpenAI-compatible endpoint for every model your business connects, using your own provider credentials.
---

The bapX API plane gives a business one OpenAI-compatible endpoint across every AI provider it has connected. You bring your own provider credentials; bapX routes, meters, and audits the calls.

## Status

The customer-facing gateway is **not open yet**. This page documents the contract it will expose so integrations can be written against a stable shape, and so the boundary between what is implemented and what is planned stays explicit.

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

`GET /v1/models` returns only the models reachable through the providers your business has actually connected. A model absent from that list is not callable — connect its provider first.

## Bring your own credentials

bapX does not resell model capacity. Every call is billed by your provider, to your account, under your own agreement with that provider.

This matters for more than pricing. Several providers' terms permit a self-hosted single-user proxy but **prohibit reselling API access or operating a multi-tenant proxy on pooled credentials**. Routing your own credentials keeps your usage inside the agreement you already accepted, rather than inside one bapX made on your behalf.

Practically:

- Add provider credentials under **Connectors** on [platform.bapx.in](https://platform.bapx.in/).
- Credentials are stored per business and are never shared across businesses.
- Agents receive only the connections authorized for their business workspace.
- Revoking a provider connection immediately removes those models from `/v1/models`.

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
[MCP access](/platform/mcp/).

Issuing a key for one surface never grants the other. A Models key spends
provider credit; an MCP key lets an external agent act as your business.
