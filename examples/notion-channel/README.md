# Notion channel example

This example receives verified Notion webhook events at
`/channels/notion/webhook`, groups useful page lifecycle events, and dispatches
them to an agent instance whose id is derived locally from the affected page.
The agent has one project-owned, read-only tool that retrieves only that page.

Required environment variables:

```sh
NOTION_TOKEN=ntn_...
NOTION_WEBHOOK_VERIFICATION_TOKEN=...
```

These optional values pin signed events to the expected Notion resources:

```sh
NOTION_WORKSPACE_ID=...
NOTION_SUBSCRIPTION_ID=...
NOTION_INTEGRATION_ID=...
```

The webhook route is:

```txt
POST /channels/notion/webhook
```

Notion initially sends the verification token without a signature. The channel
module keeps a temporary `verification(...)` callback commented beside the
normal configuration. During endpoint setup, leave
`NOTION_WEBHOOK_VERIFICATION_TOKEN` unset, uncomment that callback, start the
app, and register the route above. Store the received token through the
project's secure secret workflow as `NOTION_WEBHOOK_VERIFICATION_TOKEN`, then
remove the callback before serving ordinary events. The configured token
verifies subsequent
`X-Notion-Signature` values.

The module exports the official `@notionhq/client` v5.22.0 `client` with an
explicitly injected Fetch transport, plus the ingress `channel`. The retrieval
tool closes over the page id in trusted application code; the model cannot
choose another page, token, or network destination.

Page instance ids in this example use the local `notion-page:` prefix. That is
an application convention for this agent, not a universal conversation
identity supplied by `@bapX/notion`. The agent is intentionally dispatch-only;
any direct agent route would need to authorize a caller-selected instance id
before exposing the bound page tool.

`page.deleted` is intentionally ignored because the retrieval tool cannot read
the deleted page. Applications that need deletion workflows should dispatch to
a separately designed agent or persistence path.

The Node and workerd tests execute a real `client.pages.retrieve(...)` call
against fake Fetch implementations that throw on every unexpected destination.
They do not contact Notion:

```sh
pnpm run check:types
pnpm run test
pnpm run build
pnpm run build:cloudflare
```

`@types/node` is a development dependency because the official SDK declarations
import `node:http`, even though this example's injected Fetch path executes in
both Node and Cloudflare Workers. Projects that set `compilerOptions.types`
must include `"node"`, as this example does.
