/**
 * Sentry error reporting for Flue.
 *
 * This file is the entire integration. It does two things:
 *
 *   1. Initializes the Sentry Node SDK at module scope so every isolate
 *      that imports `app.ts` has a configured Sentry client.
 *
 *   2. Calls `observe(...)` to register a global Flue event subscriber
 *      that translates terminal Flue failures and explicit error logs into
 *      `Sentry.captureException(...)` calls with Flue correlation tags.
 *
 * Read top-to-bottom — there are no other Sentry-related files in the
 * project. Every workflow in `src/workflows/` is a created Flue workflow;
 * none of them know that Sentry exists.
 *
 *
 * Scope of this example
 * ─────────────────────
 *
 * This is intentionally focused on **error reporting**:
 *
 *   - failed workflow runs, direct agent operations, and recovered durable
 *     submissions → captured as Sentry exceptions at `error` level.
 *   - `ctx.log.error(...)` calls from handlers → captured as Sentry
 *     exceptions when an `error` attribute is present, otherwise as
 *     messages at `error` level.
 *
 * What this example does NOT do (deliberate, for now):
 *
 *   - It does not emit Sentry spans / traces for runs, operations, or
 *     tool calls. The Flue event stream already carries the data a
 *     future span-based integration would need (`durationMs`, `usage`,
 *     `operationKind`, etc.), so layering spans on top is a follow-up
 *     rather than a redesign.
 *   - It does not forward `ctx.log.info` / `.warn` to Sentry breadcrumbs
 *     or logs. Add `Sentry.addBreadcrumb({ ... })` inside the `observe`
 *     callback if you want that — it's a five-line change.
 *   - It does not capture workflow operation or tool failures separately.
 *     Workflow failures are reported once at `run_end`; tool failures are
 *     usually recoverable model input.
 *
 *
 * Isolate scoping (read this once, then forget about it)
 * ──────────────────────────────────────────────────────
 *
 * On the Node target the entire server runs in one V8 isolate, so
 * "global" subscribers are truly global.
 *
 * On the Cloudflare target each agent runs in its own Durable Object,
 * which is its own V8 isolate. This file (`app.ts`) is evaluated once
 * per isolate — the outer Worker once, plus each DO once. That means
 * `Sentry.init` and `observe(...)` run independently inside every DO.
 * Each isolate captures its own errors with its own Sentry client.
 * No cross-isolate plumbing is needed (and none is possible without
 * RPC). This is the right shape, not a workaround.
 *
 *
 * Environment variables
 * ─────────────────────
 *
 *   SENTRY_DSN          required to send anything. If unset, the SDK
 *                       is initialized in "disabled" mode and your app
 *                       runs unchanged.
 *   SENTRY_ENVIRONMENT  e.g. "production", "staging". Defaults to
 *                       NODE_ENV.
 *   SENTRY_RELEASE      e.g. a git SHA. Optional.
 */

import { type FlueEvent, observe } from '@bapX/runtime';
import { flue } from '@bapX/runtime/routing';
import * as Sentry from '@sentry/node';
import { Hono } from 'hono';

// ─── 1. Sentry init ─────────────────────────────────────────────────────────

// `Sentry.init` is module-scoped: it runs once per isolate, before any
// HTTP request is served. When SENTRY_DSN is unset (e.g. in local
// development without a DSN handy), `enabled: false` makes every
// capture call a no-op. The rest of this file behaves the same either
// way, so you don't have to gate it.
//
// `tracesSampleRate: 0` is explicit: this example does not produce
// spans, so we disable Sentry's tracing engine entirely. Set this to
// a positive number only if you add span-emitting code yourself.
Sentry.init({
	dsn: process.env.SENTRY_DSN,
	environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
	release: process.env.SENTRY_RELEASE,
	tracesSampleRate: 0,
	enabled: Boolean(process.env.SENTRY_DSN),
});

// ─── 2. The Flue → Sentry event bridge ──────────────────────────────────────

const runOwnerTags = new Map<string, Record<string, string>>();

observe((event) => {
	if (event.type === 'run_start' || event.type === 'run_resume') {
		runOwnerTags.set(event.runId, { 'flue.workflow': event.workflowName });
		return;
	}

	const tags = flueCorrelationTags(event);

	if (event.type === 'run_end') {
		runOwnerTags.delete(event.runId);
		if (event.isError) captureIncident(event.error, tags, { durationMs: event.durationMs });
		return;
	}

	if (event.type === 'operation' && event.isError && !event.runId) {
		captureIncident(event.error, tags, {
			durationMs: event.durationMs,
			operationKind: event.operationKind,
		});
		return;
	}

	if (event.type === 'submission_settled' && event.outcome === 'failed') {
		captureIncident(event.error, tags);
		return;
	}

	if (event.type === 'log' && event.level === 'error') {
		Sentry.withScope((scope) => {
			scope.setTags(tags);
			scope.setLevel('error');
			if (event.attributes) scope.setContext('flue.log_attributes', event.attributes);
			if (Object.hasOwn(event.attributes ?? {}, 'error')) {
				Sentry.captureException(reconstructError(event.attributes?.error));
			} else {
				Sentry.captureMessage(event.message, 'error');
			}
		});
	}
});

function captureIncident(
	error: unknown,
	tags: Record<string, string>,
	context?: Record<string, unknown>,
): void {
	Sentry.withScope((scope) => {
		scope.setTags(tags);
		scope.setLevel('error');
		if (context) scope.setContext('flue.incident', context);
		Sentry.captureException(reconstructError(error));
	});
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build the Sentry tags attached to every capture from this bridge.
 *
 * Tag keys use the `flue.*` prefix to namespace them away from
 * Sentry's built-in tags and from any application tags the user
 * adds. Pivoting on `flue.run.id` in Sentry's search box is the
 * fastest way to find every issue raised by a single Flue run.
 */
function flueCorrelationTags(event: FlueEvent): Record<string, string> {
	const tags: Record<string, string> = event.runId ? { ...runOwnerTags.get(event.runId) } : {};
	if (event.runId) tags['flue.run.id'] = event.runId;
	if (event.instanceId) tags['flue.instance.id'] = event.instanceId;
	if (event.dispatchId) tags['flue.dispatch.id'] = event.dispatchId;
	if (event.submissionId) tags['flue.submission.id'] = event.submissionId;
	if (event.harness) tags['flue.harness'] = event.harness;
	if (event.session) tags['flue.session'] = event.session;
	if (event.parentSession) tags['flue.parent_session'] = event.parentSession;
	if (event.operationId) tags['flue.operation.id'] = event.operationId;
	if (event.taskId) tags['flue.task.id'] = event.taskId;
	return tags;
}

/**
 * Reconstruct an `Error` instance from a value that may already be an
 * `Error`, may be the JSON-serialized envelope Flue's run-store uses
 * (`{ name, message }`), or may be something arbitrary a handler
 * threw (a string, a number, a plain object).
 *
 * Sentry's `captureException` does its best with non-Error values,
 * but it produces much better issue grouping when given a real
 * `Error` with a stable `name` and `message`.
 */
function reconstructError(raw: unknown): Error {
	if (raw instanceof Error) return raw;
	if (raw && typeof raw === 'object') {
		const o = raw as { name?: unknown; message?: unknown; stack?: unknown };
		const message = typeof o.message === 'string' ? o.message : safeStringify(raw);
		const err = new Error(message);
		if (typeof o.name === 'string') err.name = o.name;
		if (typeof o.stack === 'string') err.stack = o.stack;
		return err;
	}
	return new Error(typeof raw === 'string' ? raw : safeStringify(raw));
}

function safeStringify(value: unknown): string {
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

// ─── 3. Mount the Flue agent route ──────────────────────────────────────────

const app = new Hono();
app.route('/', flue());

export default app;
