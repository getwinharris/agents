---
title: MCP access
description: Reach your bapX business from Claude, Codex, and any other MCP client.
---

`https://api.bapx.in/mcp` is the inbound bridge for MCP clients. Point Claude,
Codex, or any other MCP-capable agent at it, authenticate with a bapX API key,
and that agent can list and call the models your business has connected.

## Connect

Issue an **MCP key** from **Connectors → API access** on
[platform.bapx.in](https://platform.bapx.in/). It resolves to exactly one
business, and an agent using it can reach nothing outside that business.

MCP keys and Models keys are separate, and a Models key is refused here with
`403 insufficient_scope`:

| Key | Prefix | Reaches |
| --- | --- | --- |
| Models | `bapx_sk_` | `https://api.bapx.in/v1` — OpenAI-compatible inference |
| MCP | `bapx_mk_` | `https://api.bapx.in/mcp` — this endpoint |

They are split because the blast radius differs. A Models key spends provider
credit. An MCP key lets an external agent act as your business. Handing an
application a key so it can call a model should not also let that application
drive your agents, so issuing one never grants the other.

```json
{
  "mcpServers": {
    "bapx": {
      "type": "http",
      "url": "https://api.bapx.in/mcp",
      "headers": { "Authorization": "Bearer ${BAPX_API_KEY}" }
    }
  }
}
```

The transport is Streamable HTTP (MCP `2025-06-18`). The endpoint is stateless:
there is no session to establish and no `Mcp-Session-Id` to carry.

## Tools

| Tool | What it does |
| --- | --- |
| `list_models` | Lists the models your business can actually call, which depends on the providers you have connected. |
| `chat_completion` | Sends an OpenAI-compatible chat completion through your own provider credentials. Address models as `<provider>/<model>`. |

Call `list_models` first. A model that is not in that list is not callable —
connect its provider on Platform rather than hardcoding a name and handling the
failure.

## What it does not do

`GET` returns `405`. The endpoint offers no server-initiated stream, because
nothing here pushes messages to the client unprompted.

Requests from a browser origin outside `bapx.in` are refused, which the MCP
transport specification requires to prevent DNS rebinding. A normal MCP client
sends no `Origin` header and is unaffected.

bapX does not resell model capacity. Every call is billed by the provider to
your own account, under the agreement you already accepted with them.

## Verify

```bash
curl -s https://api.bapx.in/mcp \
  -H "Authorization: Bearer $BAPX_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

A revoked key returns `401` immediately. An empty `list_models` result means the
business has connected no providers yet.
