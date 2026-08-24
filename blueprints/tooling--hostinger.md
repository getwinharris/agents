---
{ "kind": "tooling", "version": 1, "website": "https://www.hostinger.com" }
---

# Add Hostinger to Bapx

You are an AI coding agent connecting a Bapx project to Hostinger's official MCP
server (`hostinger/api-mcp-server`) so agents can manage hosting infrastructure —
websites, VPS instances, domains and DNS, email marketing, subscriptions, and
ecommerce — as scoped, auditable tools.

Hostinger publishes `hostinger-api-mcp` as **12 scope-separated servers**, not one
monolith. The combined `all` server exposes **350 tools**. Do not connect `all`
and filter afterwards — mount only the scoped server the project actually needs.

## Inspect the project

Read local instructions, detect the package manager, and select the first
existing source root: `<root>/.agents/`, then `<root>/src/`, then `<root>/`.
Inspect `bapX.config.ts`, `app.ts`, existing modules under `agents/` and
`workflows/`, environment types, and secret conventions.

Determine the configured target before wiring anything:

- **Node:** supported. `hostinger-api-mcp@1.35.6` declares `engines.node >=20.0.0`,
  so any currently supported Node target can run it.
- **Cloudflare:** the server cannot be spawned in a Worker. Connect to a
  separately hosted instance over `streamable-http`.

If the target cannot be determined, ask the user.

## Credentials

Hostinger authenticates with a single API token, `HOSTINGER_API_TOKEN`, created
from the Hostinger panel under API access.

Follow the project's existing secret convention. Never commit the token, never
place it in `bapX.config.ts`, and never log it. Add it to the project's
environment type definitions alongside existing secrets.

The token carries **full account authority** over billing-bearing resources —
VPS lifecycle, domain registration, and subscriptions. Treat it as a
production credential and scope the exposed toolset accordingly.

## Connect the server

Create `<source-dir>/tooling/hostinger.ts`:

```ts
// bapX-blueprint: tooling/hostinger@1
import { connectMcpServer } from '@bapX/runtime';

export const hostinger = await connectMcpServer('hostinger', {
  transport: 'streamable-http',
  url: process.env.HOSTINGER_MCP_URL!,
  headers: {
    Authorization: `Bearer ${process.env.HOSTINGER_API_TOKEN!}`,
  },
});
```

Use the existing `connectMcpServer` export from `@bapX/runtime`
(`packages/runtime/src/mcp.ts`). Do not add a second MCP client implementation.

## Scope the toolset

Exposing all 350 tools to a general agent is not acceptable. Verified destructive
and billing-bearing operations in the `all` server include
`VPS_purchaseNewVirtualMachineV1`, `VPS_recreateVirtualMachineV1`,
`VPS_deleteSnapshotV1`, `billing_deletePaymentMethodV1` and
`domains_cancelOutgoingDomainMoveV1`.

**Pick the narrowest published server.** This is a structural boundary — the
tools are not present at all — and is far stronger than filtering at runtime:

| Server binary | Tools |
| --- | --- |
| `hostinger-horizons-mcp` | 2 |
| `hostinger-dns-mcp` | 10 |
| `hostinger-billing-mcp` | 10 |
| `hostinger-ecommerce-mcp` | 18 |
| `hostinger-agency-hosting-mcp` | 27 |
| `hostinger-wordpress-mcp` | 36 |
| `hostinger-domains-mcp` | 40 |
| `hostinger-mail-mcp` | 41 |
| `hostinger-reach-mcp` | 42 |
| `hostinger-hosting-mcp` | 57 |
| `hostinger-vps-mcp` | 67 |
| `hostinger-api-mcp` (all) | **350** |

A DNS-management agent mounts `hostinger-dns-mcp` and is then incapable of
purchasing a VPS, regardless of prompt or model error.

If a further read-only restriction is needed within a scope, filter on the
verified naming convention — tools are named `<GROUP>_<verb><Resource>V<n>`, for
example `DNS_getDNSSnapshotV1` and `VPS_deleteFirewallV1`. Match the verb after
the group prefix, not the start of the string:

```ts
const readOnly = hostinger.tools.filter((tool) =>
  /^[A-Za-z-]+_(get|list)/.test(tool.name),
);
```

Any agent granted mutating tools must route them through the project's existing
approval path. Destructive and billing-bearing operations require explicit
human approval and idempotent handling — do not auto-approve them, and do not
invent a new approval mechanism when the project already has one.

## Verify

1. Confirm the deployment target runs Node.js 20+, or that the MCP server is
   reachable over `streamable-http` from the configured target.
2. Confirm `HOSTINGER_API_TOKEN` resolves at runtime and is absent from logs,
   committed files, and error payloads.
3. Call one read-only tool (for example a website or VPS list) and confirm a
   live response.
4. Confirm the agent's exposed tool list matches the intended allowlist and
   contains no unreviewed destructive operation.
5. Confirm mutating tools are gated by the project's approval path.

## Notes

Hostinger publishes this server officially at
[`hostinger/api-mcp-server`](https://github.com/hostinger/api-mcp-server).
Pin the version the project has validated rather than tracking latest — the tool
surface changes as Hostinger's API evolves, and an unpinned upgrade can silently
widen an agent's authority.

## Upgrade Guide

### Version 1 — 2026-08-13

Initial version.
