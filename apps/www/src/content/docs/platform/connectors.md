---
title: Business connectors
description: Connect your own service credentials to a bapX business, and control what agents can reach.
---

A **connection** is your own credential for a third-party service, stored against
one business. Agents receive only the connections that business has authorised.

bapX does not resell access to anything. Every connection uses credentials you
supply, under your own agreement with that provider.

## How a connection is stored

Credentials are encrypted at rest with AES-256-GCM before they touch disk.

They are never returned to any caller — not to the Platform UI, not to Agents,
not in an error payload. What you see back is metadata plus a masked hint such
as `••••a1b2`, which is enough to recognise which credential is stored and not
enough to use it. Only the runtime resolves a secret, and only for the business
that owns it.

A connection cannot be resolved across a business boundary. This is enforced in
the store, not by convention.

## Connect a service

From **Connectors** on [platform.bapx.in](https://platform.bapx.in/), choose a
service and paste its credential. Connecting a service you have already
connected **replaces** the stored credential rather than adding a second one —
so rotating a key cannot leave a stale connection quietly working alongside the
new one.

Disconnecting removes the credential immediately. Agents lose access on the next
resolution; there is no grace period.

## Three ways a service can connect

Not every service offers the same integration surface, so bapX uses a ladder and
falls through it:

1. **Native connector** — a first-class integration from the catalogue, with a
   documented tool surface.
2. **MCP** — for anything not in the catalogue, including internal systems.
   Bring your own Model Context Protocol server.
3. **Browser** — when a service has no API at all, an agent can drive its
   interface in a workspace browser session.

You do not need to know which tier a given service uses. Start with the
catalogue; the other two exist so coverage is not limited to what we have
already packaged.

## What agents can do with a connection

A connection grants an agent the ability to *act as you* against that service.
Scope it accordingly.

Destructive and billing-bearing operations — deleting resources, purchasing,
changing subscriptions — require explicit approval and are never auto-approved,
regardless of what an agent proposes or how a prompt is worded.

Prefer the narrowest connector that does the job. A connector that only exposes
DNS operations cannot purchase a server, whatever goes wrong upstream of it.

## Supported operations

| Operation | Path |
| --- | --- |
| List this business's connections | `GET /api/platform/connections` |
| Connect or replace a credential | `POST /api/platform/connections` |
| Disconnect | `DELETE /api/platform/connections/<id>` |

All three require a signed-in session. Writes additionally require a request
originating from `platform.bapx.in` — a page on another subdomain, including a
project you host with bapX, cannot change your connections.

`GET` returns a `configured` flag. When it is `false`, credential storage is not
configured on the server and connections cannot be saved; the UI surfaces this
rather than accepting a credential it would silently drop.

## Related

- [Platform API](/docs/platform/api/) — the model endpoint your connected
  providers serve.
- [Ecosystem](/docs/ecosystem/) — the connector catalogue.
