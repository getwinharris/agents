/**
 * Runtime-safe application composition APIs for an optional authored `app.ts`
 * entrypoint.
 *
 * Without `app.ts`, Flue generates an application that mounts {@link flue} at
 * `/`. When `app.ts` exists, its default {@link Fetchable} export owns the
 * request pipeline and must mount {@link flue} explicitly to publish Flue
 * routes. Compose deployment-inspection endpoints from the `listRuns()`,
 * `getRun()`, and `listAgents()` primitives exported by `@bapX/runtime`.
 *
 * ```ts
 * import { flue } from '@bapX/runtime/routing';
 * import { Hono } from 'hono';
 *
 * const app = new Hono();
 * app.route('/', flue());
 * export default app;
 * ```
 */
export { flue } from './runtime/flue-app.ts';

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
