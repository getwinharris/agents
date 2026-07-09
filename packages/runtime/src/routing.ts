/**
 * Runtime-safe application composition APIs for an optional authored `app.ts`
 * entrypoint.
 *
 * Without `app.ts`, Bapx generates an application that mounts {@link bapX} at
 * `/`. When `app.ts` exists, its default {@link Fetchable} export owns the
 * request pipeline and must mount {@link bapX} explicitly to publish Bapx
 * routes. Compose deployment-inspection endpoints from the `listRuns()`,
 * `getRun()`, and `listAgents()` primitives exported by `@bapX/runtime`.
 *
 * ```ts
 * import { bapX } from '@bapX/runtime/routing';
 * import { Hono } from 'hono';
 *
 * const app = new Hono();
 * app.route('/', bapX());
 * export default app;
 * ```
 */
export { bapX } from './runtime/bapX-app.ts';

/**
 * Structural contract for the default export of an authored `app.ts` entry.
 * Any object exposing a compatible `fetch()` method satisfies it, including a
 * `new Hono()` instance.
 *
 * On Cloudflare, `env` contains bindings and `ctx` is the
 * `ExecutionContext`. On Node, `env` contains Hono's Node adapter bindings for
 * the incoming and outgoing messages, and `ctx` is `undefined`.
 */
export interface Fetchable {
	fetch(request: Request, env?: unknown, ctx?: unknown): Response | Promise<Response>;
}
