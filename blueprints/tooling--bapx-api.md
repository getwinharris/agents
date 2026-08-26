---
{ "kind": "tooling", "version": 1, "website": "https://api.bapx.in" }
---

# Add the bapX API plane to Bapx

You are an AI coding agent pointing a Bapx project at the bapX API plane — one
OpenAI-compatible endpoint that reaches every model provider the business has
connected, using the business's own credentials.

The plane is an operator-run deployment of `github.com/bapXai/api`. Projects
never reach it directly; they authenticate to the bapX gateway with a
bapX-issued key.

## Inspect the project

Read local instructions, detect the package manager, and select the first
existing source root: `<root>/.agents/`, then `<root>/src/`, then `<root>/`.
Inspect `bapX.config.ts`, `app.ts`, existing agents under `agents/`, environment
types, and secret conventions.

Determine which model client the project already uses. **Do not add a second AI
SDK** — the plane is OpenAI-compatible, so an existing OpenAI client only needs
its base URL and key changed.

## Credentials

Issue a key from **Connectors → API access** on
[platform.bapx.in](https://platform.bapx.in/). The secret is shown **once** and
stored only as a hash; it cannot be recovered, only replaced.

Store it as `BAPX_API_KEY` following the project's existing secret convention.
Never commit it, never log it, and never place it in `bapX.config.ts`.

Keys are scoped to one business. A key issued for one business cannot reach
another's connections or credentials.

## Point the client at the plane

```ts
// bapX-blueprint: tooling/bapx-api@1
import OpenAI from 'openai';

export const models = new OpenAI({
  apiKey: process.env.BAPX_API_KEY!,
  baseURL: 'https://api.bapx.in/v1',
});
```

Address models as `<provider>/<model>` — the provider prefix is what routes the
call and is required even when the model name is unique:

```ts
const completion = await models.chat.completions.create({
  model: 'openai/gpt-4o-mini',
  messages: [{ role: 'user', content: 'Hello' }],
});
```

Supported operations are `POST /v1/chat/completions` and `GET /v1/models`.
Streaming works as it does against OpenAI.

## Bring your own credentials

bapX does not resell model capacity. Every call is billed by the provider to the
business's own account, under its own agreement with that provider.

`GET /v1/models` returns **only** the models reachable through providers the
business has actually connected on Platform. A model absent from that list is
not callable — connect its provider first rather than hardcoding a model name
and handling the failure.

This is a product boundary, not a limitation to design around. Several providers
permit a single-tenant proxy but prohibit reselling API access; routing the
business's own credentials keeps usage inside the agreement it already accepted.

## Verify

1. Confirm `BAPX_API_KEY` resolves at runtime and is absent from logs, committed
   files, and error payloads.
2. Call `GET /v1/models` and confirm a non-empty list. An empty list means the
   business has connected no providers yet.
3. Call `POST /v1/chat/completions` with a model from that list and confirm a
   response, including a streamed one if the project streams.
4. Confirm a revoked key returns `401` and the application surfaces that as a
   configuration error rather than retrying.
5. Confirm no code path sends the key anywhere except `api.bapx.in`.

## Notes

Only `/v1/*` is exposed. The plane's dashboard and administrative surfaces are
not reachable through the gateway by design — they are single-tenant and belong
to the operator, not to any business.

The plane is built on [OmniRoute](https://github.com/diegosouzapw/OmniRoute),
MIT licensed (© 2026 diegosouzapw), deployed as published and configured rather
than modified.

## Upgrade Guide

### Version 1 — 2026-08-13

Initial version.
