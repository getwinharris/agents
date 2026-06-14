# Salesforce Marketing Cloud channel example

This project receives verified Marketing Cloud Engagement Event Notification
Service (ENS) batches at:

```txt
POST /channels/salesforce-marketing-cloud/events
```

It demonstrates:

- exporting a first-party `channel`;
- exporting a project-owned narrow Fetch `client`;
- grouping transactional and engagement email lifecycle cases;
- dispatching every selected event before acknowledging the batch once;
- deriving a stable local agent id from validated ENS tenant and composite
  tracking fields;
- exposing a narrow tool that retrieves only the configured ENS callback;
- testing the same client in Node and workerd with `nodejs_compat`.

Required environment variables:

```sh
SALESFORCE_MARKETING_CLOUD_REST_BASE_URL=https://tenant-subdomain.rest.marketingcloudapis.com
SALESFORCE_MARKETING_CLOUD_ACCESS_TOKEN=...
SALESFORCE_MARKETING_CLOUD_CALLBACK_ID=...
SALESFORCE_MARKETING_CLOUD_SIGNATURE_KEY=...
```

`SALESFORCE_MARKETING_CLOUD_REST_BASE_URL` must be the trusted tenant REST
origin returned for the installed package. The client rejects HTTP, credentials,
ports, query strings, fragments, non-root paths, and hosts outside
`*.rest.marketingcloudapis.com`. `getCallback()` can only append an encoded
callback id beneath `/platform/v1/ens-callbacks/` and always sends the configured
access token as Bearer authentication.

The channel restricts unsigned setup verification to the configured callback
id and verifies signed event batches with the callback-specific ENS signature
key. Salesforce returns that signature key only during callback creation, so
store it separately from the REST access token.

The handler selects these current email families:

- `TransactionalSendEvents.EmailSent`
- `TransactionalSendEvents.EmailNotSent`
- `TransactionalSendEvents.EmailBounced`
- `EngagementEvents.EmailOpen`
- `EngagementEvents.EmailClick`
- `EngagementEvents.EmailUnsubscribe`

Before any dispatch, each selected event must contain positive `mid` and `eid`
values plus `composite.jobId`, `composite.batchId`, `composite.listId`, and
`composite.subscriberId`. Those fields form an application-local agent id that
groups one recipient's email lifecycle within the configured callback. This is
local routing policy, not a universal Salesforce Marketing Cloud conversation
key and not an authorization capability. Any direct agent route must authorize
caller-selected ids independently.

The callback lookup tool has no model-controlled parameters. Trusted code binds
the REST origin, access token, and callback id before the agent runs. Production
applications should acquire and refresh access tokens in trusted application
code instead of letting a model choose credentials or tenant URLs.

ENS delivers ordered batches and can retry a whole batch after a non-2xx
response. This example validates all selected events first, dispatches them in
provider order, and returns one `204` only after all dispatches complete.
Applications that require exactly-once effects must claim provider event data
in durable storage before dispatch; a failed batch can otherwise repeat work
that completed before the failure.

Callback creation and verification, OAuth installation, token refresh, event
subscription management, deduplication, persistence, and delivery-volume
controls remain application-owned. The tests use original synthetic payloads
and fail-closed Fetch implementations; they never contact Salesforce:

```sh
pnpm run check:types
pnpm run test
pnpm run build
pnpm run build:cloudflare
```
