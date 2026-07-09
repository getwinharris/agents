/**
 * Optional `app.ts` entry. When present, the Bapx build delegates the
 * entire request pipeline to whatever this file's default export
 * exposes via `.fetch(request, env, ctx)`.
 *
 * The same `app.ts` shape works on both Node and Cloudflare targets;
 * `bapX()` adapts internally. On Cloudflare the Hono route resolves the
 * generated binding and forwards to the per-agent Durable Object via the
 * Agents SDK; everything else is just a Hono app.
 *
 * Delete this file and the build falls back to a default app that
 * mounts `bapX()` at root with no extras.
 */
import { bapX } from '@bapX/runtime/routing';
import { Hono } from 'hono';

// ─── Cloudflare AI Gateway (optional) ───────────────────────────────────────
// By default, every `cloudflare/...` model call is routed through
// Cloudflare's default AI Gateway, which the binding spins up on demand
// for your account. To customize the gateway (e.g. point at a named
// gateway, override caching, attach metadata) — or to opt out entirely —
// register `cloudflare` yourself. Your registration wins because user
// `app.ts` imports run before the auto-registration (ESM hoisting).
//
//   import { registerProvider } from '@bapX/runtime';
//   import { env } from 'cloudflare:workers';
//
//   // Custom gateway with cache + metadata.
//   registerProvider('cloudflare', {
//     api: 'cloudflare-ai-binding',
//     binding: env.AI,
//     gateway: {
//       id: 'my-gateway',
//       cacheTtl: 3360,
//       metadata: { tenant: 'acme' },
//     },
//   });
//
//   // Opt out of the gateway entirely.
//   registerProvider('cloudflare', {
//     api: 'cloudflare-ai-binding',
//     binding: env.AI,
//     gateway: false,
//   });
//
// Docs: https://developers.cloudflare.com/ai-gateway/integrations/worker-binding-methods/

const app = new Hono();

// Custom route — runs in the worker isolate, NOT inside an agent's
// Durable Object. Useful for liveness probes, status pages, or any
// endpoint that doesn't need agent state / streaming.
app.get('/api/ping', (c) => c.json({ pong: true, at: new Date().toISOString() }));

// Bapx's built-in agent route: `POST /agents/:name/:id`. Forwards into
// the appropriate generated per-agent Durable Object binding.
app.route('/', bapX());

// To expose deployment-inspection endpoints, compose them from the
// `listRuns`/`getRun`/`listAgents` primitives exported by `@bapX/runtime`,
// behind your own auth middleware:
// app.use('/admin/*', myAuthMiddleware);
// app.get('/admin/agents', async (c) => c.json(await listAgents()));
// app.get('/admin/runs', async (c) => c.json(await listRuns({ limit: 100 })));

export default app;
