---
title: Salesforce Marketing Cloud
description: Receive verified Marketing Cloud Engagement ENS batches and compose a tenant-bound Fetch client.
---

## Add Salesforce Marketing Cloud

Run the Salesforce Marketing Cloud Engagement recipe through your coding
agent:

```sh
flue add salesforce-marketing-cloud --print | codex
```

It installs `@flue/salesforce-marketing-cloud` and creates named `channel` and
project-owned `client` exports. The integration targets Marketing Cloud
Engagement Event Notification Service (ENS), not generic Salesforce APIs.

Register the complete callback URL:

```txt
https://example.com/channels/salesforce-marketing-cloud/events
```

`SALESFORCE_MARKETING_CLOUD_SIGNATURE_KEY` verifies inbound ENS batches.
`SALESFORCE_MARKETING_CLOUD_ACCESS_TOKEN` authenticates application-owned REST
requests. They are separate credentials.

## Channel module

```ts title="src/channels/salesforce-marketing-cloud.ts"
import {
  createSalesforceMarketingCloudChannel,
  type SalesforceMarketingCloudEvent,
} from '@flue/salesforce-marketing-cloud';
import { defineTool, dispatch } from '@flue/runtime';
import assistant from '../agents/assistant.ts';
import { createSalesforceMarketingCloudClient } from '../salesforce-marketing-cloud-client.ts';
import {
  emailEventInstanceId,
  emailRefFromEvent,
  type SalesforceMarketingCloudEmailRef,
} from '../salesforce-marketing-cloud-email.ts';

const callbackId = requiredEnv('SALESFORCE_MARKETING_CLOUD_CALLBACK_ID');

export const client = createSalesforceMarketingCloudClient({
  restBaseUrl: requiredEnv('SALESFORCE_MARKETING_CLOUD_REST_BASE_URL'),
  accessToken: requiredEnv('SALESFORCE_MARKETING_CLOUD_ACCESS_TOKEN'),
});

export const channel = createSalesforceMarketingCloudChannel({
  signatureKey: requiredEnv('SALESFORCE_MARKETING_CLOUD_SIGNATURE_KEY'),
  callbackId,

  // Path: /channels/salesforce-marketing-cloud/events
  async events({ c, batch }) {
    const usefulEvents: Array<{
      event: SalesforceMarketingCloudEvent;
      ref: SalesforceMarketingCloudEmailRef;
    }> = [];

    for (const event of batch.events) {
      switch (event.eventCategoryType) {
        case 'TransactionalSendEvents.EmailSent':
        case 'TransactionalSendEvents.EmailNotSent':
        case 'TransactionalSendEvents.EmailBounced':
        case 'EngagementEvents.EmailOpen':
        case 'EngagementEvents.EmailClick':
        case 'EngagementEvents.EmailUnsubscribe': {
          const ref = emailRefFromEvent(callbackId, event);
          if (!ref) {
            return c.json({ error: 'Expected a supported Marketing Cloud email event.' }, 400);
          }
          usefulEvents.push({ event, ref });
          break;
        }
        default:
          break;
      }
    }

    for (const { event, ref } of usefulEvents) {
      await dispatch(assistant, {
        id: emailEventInstanceId(ref),
        input: {
          type: `salesforce-marketing-cloud.${event.eventCategoryType}`,
          occurredAt: event.timestampUTC,
          callbackId: ref.callbackId,
          mid: ref.mid,
          eid: ref.eid,
          tracking: {
            jobId: ref.jobId,
            batchId: ref.batchId,
            listId: ref.listId,
            subscriberId: ref.subscriberId,
          },
          details: event.info ?? {},
        },
      });
    }

    return c.body(null, 204);
  },
});

export function retrieveCallback(ref: SalesforceMarketingCloudEmailRef) {
  if (ref.callbackId !== callbackId) {
    throw new TypeError('Expected the configured Marketing Cloud callback.');
  }
  return defineTool({
    name: 'retrieve_salesforce_marketing_cloud_callback',
    description: 'Retrieve the Marketing Cloud ENS callback bound to this agent.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    async execute() {
      return JSON.stringify(await client.getCallback(callbackId));
    },
  });
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
```

The route is fixed at `POST /events`. The example groups selected email event
families while leaving the ENS taxonomy open. `emailRefFromEvent()` is
application code that validates `mid`, `eid`, and the selected families'
tracking fields under `event.raw.composite`. It normalizes those values with
`callbackId` into a local agent id and rejects malformed events.

ENS supplies no universal delivery or conversation id. This email identity is
valid only for the families the application validates. `compositeId` is
optional and deprecated for transactional email, so do not use it as a
universal key.

## Project-owned client

Use a narrow Fetch client and validate the tenant origin before attaching a
Bearer token:

```ts title="src/salesforce-marketing-cloud-client.ts"
export function createSalesforceMarketingCloudClient({
  restBaseUrl,
  accessToken,
  fetcher = globalThis.fetch,
}: {
  restBaseUrl: string;
  accessToken: string;
  fetcher?: typeof globalThis.fetch;
}) {
  const origin = salesforceMarketingCloudRestOrigin(restBaseUrl);
  if (!accessToken || accessToken.trim() !== accessToken) {
    throw new TypeError('Marketing Cloud access token must be non-empty and trimmed.');
  }

  return {
    async getCallback(callbackId: string) {
      if (!callbackId || callbackId.trim() !== callbackId) {
        throw new TypeError('Marketing Cloud callback id must be non-empty and trimmed.');
      }
      const response = await fetcher(
        `${origin}/platform/v1/ens-callbacks/${encodeURIComponent(callbackId)}`,
        {
          method: 'GET',
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${accessToken}`,
          },
        },
      );
      if (!response.ok) {
        throw new Error(`Marketing Cloud API request failed with ${response.status}.`);
      }
      const value: unknown = await response.json();
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError('Marketing Cloud returned an invalid callback response.');
      }
      return value;
    },
  };
}

function salesforceMarketingCloudRestOrigin(value: string): string {
  const url = new URL(value);
  const suffix = '.rest.marketingcloudapis.com';
  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    url.port !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== '' ||
    !url.hostname.endsWith(suffix) ||
    url.hostname.length === suffix.length
  ) {
    throw new TypeError('Expected an HTTPS tenant origin ending in .rest.marketingcloudapis.com.');
  }
  return url.origin;
}
```

Do not accept an arbitrary API origin, callback id, or token from a model or
event. The tool shown above binds all three in trusted application code and
performs only:

```txt
GET /platform/v1/ens-callbacks/{callbackId}
Authorization: Bearer <access token>
```

No Salesforce SDK is required. Callback registration, OAuth, token refresh,
subscription lifecycle, token storage, and broader outbound API behavior
remain application-owned.

## Bind the agent

```ts title="src/agents/assistant.ts"
import { createAgent } from '@flue/runtime';
import { retrieveCallback } from '../channels/salesforce-marketing-cloud.ts';
import { parseEmailEventInstanceId } from '../salesforce-marketing-cloud-email.ts';

export default createAgent(({ id }) => {
  const email = parseEmailEventInstanceId(id);
  return {
    model: 'anthropic/claude-haiku-4-5',
    tools: [retrieveCallback(email)],
  };
});
```

The tool accepts no tenant origin, callback id, access token, or resource id
from the model. The parsed local id remains an identifier, not authorization;
the tool checks its callback id again before selecting credentials.

## Callback verification

During callback setup, Marketing Cloud sends an unsigned JSON body containing
exactly:

```json
{
  "callbackId": "provider-callback-id",
  "verificationKey": "one-time-verification-key"
}
```

Unsigned setup requests are accepted only when the channel has a
`verification` handler. Restrict `callbackId`, call
`POST /platform/v1/ens-verify` from application code, and disable the handler
after setup. Without the handler, unsigned requests receive `401`.

Flue validates the shape and returns the required empty `200` after the
handler completes. It does not register callbacks, obtain tokens, or call the
verification API automatically. Keep this setup call separate from the
GET-only client above unless the application explicitly needs it.

## Signatures and event batches

Signed notifications include:

```txt
x-sfmc-ens-signature: <base64 HMAC-SHA256 digest>
```

Marketing Cloud signs the exact body bytes. `signatureKey` is the opaque
string returned during callback creation and is imported directly as UTF-8
HMAC key material. Do not base64-decode it. Only the signature header is
base64-decoded.

The signed payload is an ordered, nonempty array of at most 1000 events. Every
event has:

- a nonempty `eventCategoryType`;
- a nonnegative safe-integer `timestampUTC`;
- optional family-dependent `compositeId`, `mid`, `eid`, and `info`;
- `raw`, containing the complete provider object.

The batch also exposes `rawBody`, the exact UTF-8 body after signature
verification. The package validates the common shape but does not close the
event taxonomy or infer a universal resource, actor, delivery, or conversation
identity. Optional fields are projected only when they match their documented
common types; family-specific or future shapes remain available in `raw`.

## Responses and delivery

Returning nothing produces an empty `200`. A JSON-compatible value becomes a
JSON `200`. A normal Hono or Fetch `Response` passes through unchanged.

ENS acknowledges only statuses `200` through `204`. Channel failures,
unsupported return values, and timeouts produce `500`. A custom `Response`
outside the acknowledgment range is passed through and can cause redelivery.

`handlerTimeoutMs` defaults to 2500 and cannot exceed 2500. The deadline covers
body receipt, signature verification, parsing, callback verification, and
event handling. If body processing exhausts the deadline, application code is
not started. Already-started work may continue after a timeout response.

ENS delivery is at least once and retries may continue for up to seven days.
The package does not deduplicate or persist events. Use application-owned
durable state and a family-appropriate key before non-idempotent work.

## Cloudflare Workers

Ingress and the project-owned client use standards-based Fetch, URL, and Web
Crypto APIs. They execute in workerd under Flue's canonical `nodejs_compat`
configuration; package workerd tests exercise exact-body HMAC verification.

Use original synthetic event batches and local keys for tests. Test the real
client with injected fail-closed Fetch in Node and workerd, asserting the exact
tenant host, callback path, method, and Bearer header. Never register a live
callback, perform OAuth, call `/ens-verify`, or contact Salesforce from tests.

See the
[`@flue/salesforce-marketing-cloud` API reference](/docs/api/salesforce-marketing-cloud-channel/).
