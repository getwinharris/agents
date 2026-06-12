---
title: Errors
description: SDK HTTP and stream error types.
---

See [Errors Reference](/docs/api/errors-reference/) for shared transport envelopes and stable public error categories.

## `FlueApiError`

```ts
class FlueApiError extends Error {
  readonly status: number;
  readonly body: unknown;
}
```

Failed SDK HTTP JSON request. `status` is the HTTP response status. `body` is the parsed response body when available, or the response text otherwise. Framework-owned routes normally return `{ error: FluePublicError }`; application-owned middleware may return arbitrary bodies.

## `FluePublicError`

```ts
interface FluePublicError {
  type: string;
  message: string;
  details: string;
  dev?: string;
  meta?: Record<string, unknown>;
}
```

Structured server error data used by transport error responses.

## Stream errors

`stream()` and `events()` reads are backed by [`@durable-streams/client`](https://www.npmjs.com/package/@durable-streams/client), and stream failures surface as that package's error classes. The SDK re-exports the ones reachable through its read paths so you can `instanceof`-match them without installing the package yourself. Their shapes are owned by `@durable-streams/client` and track its releases.

### `DurableStreamError`

```ts
class DurableStreamError extends Error {
  status?: number;
  code: string;
  details?: unknown;
}
```

Protocol-level stream failure. `code` is a structured error code for programmatic handling (for example `NOT_FOUND` for a missing stream, `BAD_REQUEST` for invalid parameters); `status` is the HTTP status when applicable.

### `StreamClosedError`

```ts
class StreamClosedError extends DurableStreamError {
  readonly code: 'STREAM_CLOSED';
  readonly status: 409;
  readonly finalOffset?: string;
}
```

The stream was closed. `finalOffset` is the stream's final offset when the server reports it.

### `FetchError`

```ts
class FetchError extends Error {
  url: string;
  status: number;
  text?: string;
  json?: object;
  headers: Record<string, string>;
}
```

Transport-level HTTP failure during a stream read.

### `FetchBackoffAbortError`

```ts
class FetchBackoffAbortError extends Error {}
```

A stream request was aborted while waiting to retry.
