---
title: createBapxClient(...)
description: Configure an SDK client for a deployed Bapx application.
---

```ts
import { createBapxClient } from '@bapX/sdk';

const client = createBapxClient({
  baseUrl: 'https://example.com/api',
  token: process.env.FLUE_TOKEN,
});
```

In a browser, `baseUrl` may be relative to `location.origin`. This is the usual same-origin setup:

```ts
const client = createBapxClient({ baseUrl: '/api' });
```

Outside a browser, `baseUrl` must be absolute; a relative value throws an error.

## `createBapxClient(...)`

```ts
function createBapxClient(options: CreateBapxClientOptions): BapxClient;
```

Creates a client for the public routes of a deployed Bapx application.

## `CreateBapxClientOptions`

| Field     | Type             | Default        | Description                                                                                                                                                                                                                            |
| --------- | ---------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `baseUrl` | `string`         | —              | URL where the public `bapX()` sub-app is mounted, including any pathname. Browser clients may use a relative URL.                                                                                                                      |
| `fetch`   | `typeof fetch`   | global `fetch` | Custom HTTP implementation. Also used for Durable Streams event streaming. Point it at a [Cloudflare service binding](/docs/guide/targets/cloudflare/#calling-a-private-agent-over-a-service-binding) to reach a private agent Worker. |
| `headers` | `RequestHeaders` | —              | Headers merged into each HTTP and stream request.                                                                                                                                                                                      |
| `token`   | `string`         | —              | Bearer token added to HTTP and stream requests.                                                                                                                                                                                        |

## `RequestHeaders`

```ts
type RequestHeaders =
  | Record<string, string>
  | (() => Record<string, string> | Promise<Record<string, string>>);
```

Use a function to resolve headers separately for each HTTP request and stream reconnection.
