---
{ "kind": "tooling", "version": 1, "website": "https://www.hostinger.com" }
---

# Add Hostinger to Bapx

You are an AI coding agent connecting a Bapx project to Hostinger's official MCP
server (`hostinger/api-mcp-server`) so agents can manage hosting infrastructure —
websites, VPS instances, domains and DNS, email marketing, subscriptions, and
ecommerce — as scoped, auditable tools.

Hostinger's server exposes **over 100 tools**. Do not attempt to re-wrap them as
individual Bapx tools. Connect the server and expose a filtered subset.

## Inspect the project

Read local instructions, detect the package manager, and select the first
existing source root: `<root>/.agents/`, then `<root>/src/`, then `<root>/`.
Inspect `bapX.config.ts`, `app.ts`, existing modules under `agents/` and
`workflows/`, environment types, and secret conventions.

Determine the configured target before wiring anything:

- **Node:** supported. The Hostinger MCP server **requires Node.js 24 or newer**.
  Verify the deployment runtime before proceeding — a Node 22 target cannot run
  this server in-process and must reach it over `streamable-http` instead.
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

export const hostinger = await connectMcpServer({
  name: 'hostinger',
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

Exposing all 100+ tools to a general agent is not acceptable — the set includes
destructive and billing-bearing operations (VPS rebuild and delete, domain
purchase, subscription changes).

Select an explicit allowlist for the agent's actual job. A read-only diagnostic
agent should receive only list and get operations:

```ts
const readOnly = hostinger.tools.filter((tool) =>
  /^(list|get)_/.test(tool.name),
);
```

Any agent granted mutating tools must route them through the project's existing
approval path. Destructive and billing-bearing operations require explicit
human approval and idempotent handling — do not auto-approve them, and do not
invent a new approval mechanism when the project already has one.

## Verify

1. Confirm the deployment target runs Node.js 24+, or that the MCP server is
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
