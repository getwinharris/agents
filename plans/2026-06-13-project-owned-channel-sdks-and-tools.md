# Project-Owned Channel SDKs and Tools

## Status and relationship to prior work

This plan starts from the completed implementation recorded in
`plans/2026-06-10-first-party-channels.md`. The current branch already contains
implemented, reviewed, and validated `@flue/github`, `@flue/slack`, and
`@flue/discord` packages, examples, workerd coverage, documentation, package
artifacts, and unreleased changelog entries.

This is a deliberate pre-publication product correction, not completion of the
earlier plan. It supersedes that plan's outbound client and tool-factory
decisions while preserving its verified ingress, handler ownership,
acknowledgement, delivery identity, conversation identity, and target-runtime
work.

Publication remains outside this plan and requires a separate explicit release
request.

## Implementation log

### 2026-06-13

Implementation policy:

- The plan is directional rather than immutable. Implementation may deviate
  when genuinely new evidence from the codebase, provider documentation,
  target-runtime validation, or review shows that another approach better
  satisfies the agreed product contract.
- Record every material deviation here with the evidence, alternatives,
  reasoning, and validation impact so it can be reviewed after implementation.
- Do not use this permission for unrecorded product expansion or convenience
  refactors. Consequential unresolved public API or architecture choices remain
  deferred as described by the goal.

Completed:

- Added immediate `channels/*.{ts,mts,js,mjs}` discovery beside agents and
  workflows.
- Extended generated Node and Cloudflare entries to import discovered channel
  modules, validate named `channel` exports and route declarations, and pass
  normalized handlers through `configureFlueRuntime()`.
- Added `/channels/:name/:suffix` runtime routing with uniform `flue()` mount
  prefix behavior, `404` handling for top-level channel namespaces and unknown
  suffixes, and `405` handling for wrong methods.
- Preserved the requirement that a project contain at least one agent or
  workflow and added channel files to dev reload discovery.
- Migrated `@flue/github` to one constructor-owned
  `webhook({ c, event })` callback at fixed `/webhook`; removed its outbound
  client, tools, outbound configuration, registration maps, and
  `@flue/runtime` dependency; retained verification, handshakes, identity, and
  explicit unknown-event forwarding.
- Migrated `@flue/slack` to optional constructor-owned
  `events({ c, event })` and `interactions({ c, interaction })` callbacks at
  fixed `/events` and `/interactions`; omitted callbacks omit routes; removed
  outbound surfaces and retained verification, handshakes, trusted identity,
  and explicit unknown variants.
- Migrated `@flue/discord` to one constructor-owned
  `interactions({ c, interaction })` callback at fixed `/interactions`;
  removed outbound surfaces and retained Ed25519 verification, PING/PONG,
  destination identity, and explicit unknown interaction forwarding.
- Updated the lockfile after adding direct Hono dependencies to the provider
  packages.
- Passed focused and final Node tests, workerd tests, builds, and type checks
  for each migrated provider package.
- Rebuilt the three channel examples around file discovery. Each now exports
  `channel` and a project-owned provider SDK `client`, defines one narrow
  application-owned tool, removes `app.ts`, and preserves the deferred
  channel-agent module cycle.
- Added the `channel` connector category, generic recipe, and named GitHub,
  Slack, and Discord recipes. Regenerated the CLI connector registry and added
  end-to-end `flue add` tests for listing, named recipe output, frontmatter
  removal, generic URL substitution, and category guidance.
- Rewrote the channels guide, provider setup guides and API references, custom
  channel guide, tools guidance, routing/layout docs, CLI add docs, package
  READMEs, and unreleased changelog around ingress ownership, SDK ownership,
  discovered routes, and application-owned tools.
- Exercised all three built Node examples with synthetic valid signatures and
  no provider network calls:
  - GitHub unknown delivery at `/channels/github/webhook` returned empty `200`;
  - Slack URL verification at `/channels/slack/events` returned the challenge;
  - Discord signed PING at `/channels/discord/interactions` returned PONG.
  This also loaded the documented deferred channel-agent ESM cycles through the
  generated server entry.
- Completed a focused post-implementation review and resolved four concrete
  findings:
  - JSON response validation now treats its `seen` set as an active recursion
    stack, so repeated references serialize normally while actual cycles still
    fail;
  - Slack URL verification and unsupported outer Events API envelopes now
    require matching signed app and workspace identity instead of filling
    missing trusted fields from configuration, and unsupported envelopes expose
    `eventId` only when Slack supplies one;
  - the configured Slack handler deadline now applies to unsupported outer
    envelopes as well as ordinary event callbacks, with mandatory internal
    timeout arguments preventing another omitted call site;
  - channel connector frontmatter now uses the registry's required strict JSON
    syntax, and the generic recipe includes its required default path comment.
- Added explicit routing coverage for multiple methods on one suffix,
  multi-segment suffixes, malformed methods, empty suffixes, and query-bearing
  suffixes.
- Packed all three provider packages and compiled a clean strict TypeScript
  consumer using custom Hono bindings and variables. Hono was installed from
  the packages' direct dependencies, and `@flue/runtime` was absent.

Research recorded so far:

- GitHub outbound examples use official `@octokit/rest` 22.0.1. Its published
  package supports Node 20+ and documents browser usage; the complete example
  imports and bundles through Flue's Node and Cloudflare targets.
- Slack outbound examples use official `@slack/web-api` 8.0.0-rc.1. Slack
  replaced Axios with `globalThis.fetch` for v8 and explicitly identifies Node,
  Deno, Bun, and Cloudflare Workers as supported runtimes. The typed
  `chat.postMessage()` path executes in workerd through the default Fetch
  transport. The current release candidate still imports Node utility modules,
  so Cloudflare uses Flue's required `nodejs_compat` flag.
- Discord has no official JavaScript REST SDK. Examples use
  `@discordjs/rest` 2.6.1 with `discord-api-types` 0.38.48, accurately described
  as the dominant community-maintained client. The published REST options
  document `makeRequest: fetch`; the complete example bundles through both
  targets.
- All three Cloudflare builds required the target's normal `agents` runtime
  dependency. Once installed, their actual SDK imports bundled successfully.
  The builds emitted only the existing missing-Durable-Object-migration warning
  because these provider examples do not carry deployable Wrangler
  migration history.

Deviations:

1. **GitHub default JSON serialization uses `Response.json()` internally
   rather than Hono's generic `c.json()`.**
   - Evidence: the provider response union caused excessive TypeScript generic
     instantiation in the package declarations when passed through `c.json()`.
   - Alternatives: weaken the provider response type, add broad casts around
     `c.json()`, or construct the standards-based JSON response directly.
   - Reasoning: `Response.json()` preserves the public contract of accepting
     plain JSON-compatible values and returning an ordinary response without
     weakening callback types or exposing a custom response API.
   - Validation impact: retain explicit tests for JSON bodies, status, headers,
     and Hono `Response` passthrough in Node and workerd.
2. **Discord's pre-existing custom component/response serializer was removed
   instead of retained as shared ingress code.**
   - Evidence: after outbound clients and generic tools were removed, the
     serializer represented an additional Flue-owned abstraction over
     Discord's native interaction response wire format and no longer served an
     ingress requirement.
   - Alternatives: preserve and document the serializer as a package helper,
     or accept Discord-native JSON directly.
   - Reasoning: direct typed provider JSON matches the agreed normal Hono
     response model, keeps application policy in application code, and reduces
     the public surface before first publication.
   - Validation impact: tests now assert native Discord response JSON,
     JSON-compatibility rejection, required interaction responses, and
     PING/PONG behavior directly.
3. **Slack's project-owned SDK moved from stable v7 to the v8 release
   candidate.**
   - Evidence: after the initial implementation, Slack published
     `@slack/web-api@8.0.0-rc.1`, replacing Axios with Fetch and explicitly
     supporting Cloudflare Workers.
   - Alternatives: retain stable v7 with a target caveat, maintain a narrow
     application Fetch wrapper, or adopt the official cross-runtime release
     candidate.
   - Reasoning: Flue is itself pre-1.0, the v8 API preserves the ordinary
     `WebClient` method surface used by the example, and adopting it now aligns
     the canonical integration with Slack's future stable transport.
   - Validation impact: the example owns a permanent workerd test for a typed
     `chat.postMessage()` call through the SDK's default Fetch transport.

Final validation:

- `@flue/runtime`: build, type check, and all 656 tests passed.
- `@flue/cli`: build, type check, 43 Node tests, and 24 Vitest tests passed.
  Registry generation reported 14 named connectors and two category roots.
- `@flue/github`, `@flue/slack`, and `@flue/discord`: each passed build, type
  check, focused Node tests, and workerd tests.
- All three channel examples passed strict type checking and Node builds.
  Separate real Cloudflare builds bundled each actual provider SDK import.
- Synthetic signed requests against the final built Node examples returned the
  expected GitHub empty acknowledgement, Slack URL-verification challenge, and
  Discord PONG without contacting a provider.
- Docs passed `astro check` and a 71-page production build. The website build
  generated all four channel connector Markdown routes.
- `scripts/prepare-publish.mjs` regenerated prepared docs for every public
  package. Final provider tarballs depend on Hono, contain current ingress
  bundles and declarations, and contain no removed client/component modules or
  `@flue/runtime` dependency.
- A clean packed-package consumer compiled strict TypeScript with custom Hono
  bindings and variables and without `@flue/runtime`.
- Scoped Biome/Prettier formatting, Knip, `git diff --check`, stale-claim
  searches, and the root `npm run check` all passed.
- A final fresh pack of all three provider packages after the last type-only
  cleanup again confirmed that their tarballs contain the ingress build and
  declarations but no removed client/component modules or `@flue/runtime`
  dependency.
- Follow-up target validation moved the Slack example and recipe to
  `@slack/web-api@^8.0.0-rc.1`. The example passed strict type checking, its
  Node build, a complete Flue Cloudflare build, and a permanent workerd test
  exercising typed `chat.postMessage()` through the SDK's default Fetch
  transport without contacting Slack. The repository-wide check also passed
  with that workerd test in the normal Turbo test graph.
- Removed regenerated ignored `.flue-vite` artifacts from the three channel
  examples and terminated only orphaned processes whose commands referenced
  Flue CLI test temp fixtures. User-run repository dev servers were left
  untouched. The final `git diff --check` passed.
- CLI coverage explicitly verifies that a project containing channels but no
  agent or workflow is rejected by the existing application requirement.
- Requirement audit: every completion criterion below is satisfied. No work
  remains deferred for user direction.

Remaining risks and target notes:

- Slack Web API v8 is still a release candidate. The canonical dependency
  range begins at `8.0.0-rc.1` and can adopt the stable v8 release without
  returning to the Axios transport. The current package requires
  `nodejs_compat` for remaining Node utility imports.
- The Cloudflare example builds emit the repository's existing missing Durable
  Object migration warning because these examples are bundle fixtures rather
  than deployment-ready Wrangler projects.
- Repository-wide Biome lint still reports existing warnings in unrelated
  modules, but exits successfully; no task-introduced provider warning remains.

Validation notes:

- Generated application builds must follow the repository's documented
  dependency order: build `@flue/runtime`, then `@flue/cli`, then consumers.
  An initial signed-route smoke run used a stale runtime artifact and returned
  `404` despite correct generated handler maps. Rebuilding runtime and the
  consumers produced the expected verified responses. This was validation
  ordering, not a product or implementation deviation.
- The first post-review CLI build rejected the new connector files because
  their frontmatter used single-quoted JavaScript object syntax rather than
  JSON. This was an implementation defect caught by the real registry
  generator; after conversion, generation reported 14 connectors and two
  category roots, and the focused `flue add` tests passed.
- Prettier then reproduced the invalid single-quoted frontmatter because the
  new recipe family was not covered by the existing connector ignore rule.
  Extending that established rule to `connectors/channel*.md` keeps registry
  JSON stable while leaving recipe prose intentionally unformatted, matching
  sandbox recipe handling.
- Knip initially reported the required example `client` exports as unused.
  Adding discovered `channels/*` files to the example workspace entry pattern
  models the real Flue build graph and makes those application entry exports
  intentional rather than globally suppressing unused exports.

## Product decision

First-party channel packages own inbound provider protocol handling:

- exact-body signature verification;
- request limits, parsing, and provider identity checks;
- handshakes, acknowledgement behavior, and handler deadlines;
- typed normalized event or interaction envelopes;
- one verified application handler per discovered provider protocol route;
- provider delivery metadata;
- canonical conversation or destination identity helpers.

They do not own outbound provider clients or model-facing tools.

Outbound platform APIs are too broad and provider-specific for Flue to wrap
well. Each application should use the established provider SDK directly and
define only the tools its agents actually need. Tool definitions are
application policy: they choose allowed operations, bind trusted destinations,
validate arguments, constrain credentials, and decide how provider results are
presented to the model.

`flue add <provider>` supplies the integration as editable project source. The
recipe installs the ingress package and selected provider SDK, creates the
provider module, wires verified constructor callbacks and dispatch, and helps
the coding agent author application-specific tools from the SDK.

## Target package shape

The first-party package constructors accept ingress credentials, trusted
provider identity, and the application handlers for each supported protocol
surface:

```ts
const github = createGitHubChannel({
	webhookSecret: env.GITHUB_WEBHOOK_SECRET,
	async webhook({ c, event }) {
		// switch over verified GitHub events
	},
});

const slack = createSlackChannel({
	signingSecret: env.SLACK_SIGNING_SECRET,
	appId: env.SLACK_APP_ID,
	teamId: env.SLACK_TEAM_ID,
	async events({ c, event }) {
		// switch over verified Events API events
	},
	async interactions({ c, interaction }) {
		// switch over verified actions and view submissions
	},
});

const discord = createDiscordChannel({
	publicKey: env.DISCORD_PUBLIC_KEY,
	applicationId: env.DISCORD_APPLICATION_ID,
	async interactions({ c, interaction }) {
		// switch over verified commands, components, and modals
	},
});
```

Each returned channel retains:

- `conversationKey(...)`;
- `parseConversationKey(...)`.

Each returned channel removes:

- provider-specific `on*()` registration and mutable handler maps;
- `.client`;
- `.tools`;
- outbound token configuration;
- outbound Fetch and timeout configuration;
- outbound-only message types, options, errors, and rate-limit types.

Types shared with ingress or identity remain. Provider packages should not add a
provider SDK dependency solely to type webhook responses. Application code may
use its installed SDK's request or response types with `satisfies` where useful;
provider response protocols expose provider-specific TypeScript return types,
while the runtime boundary accepts JSON-compatible values or a Hono `Response`.
Discord destination types remain part of the normalized ingress contract.

After removing `defineTool(...)`, the provider packages should have no
dependency or peer dependency on `@flue/runtime`. They become portable
Web Crypto and Hono integrations that applications compose with Flue through
`dispatch(...)`. Each provider package uses `hono` as a direct dependency for
the handler context and route execution, but does not depend on Flue runtime
internals. Applications that author `app.ts` should still declare their own
direct `hono` dependency rather than relying on a transitive installation.

Provider constructor options remain provider-specific. A channel may accept an
initialized provider SDK client when that SDK supplies ingress verification,
parsing, or event types, as Stripe does. Another channel may accept only a
secret, public key, or verifier because its SDK adds no ingress value. The
boundary is that the project creates and owns the SDK client; Flue does not
invent a universal client option or require a client when the provider protocol
does not need one.

Handler context types should preserve Hono environment typing. Channel
factories may expose a Hono `Env` generic so applications with typed bindings or
variables receive the same `c.env` and `c.var` types inside channel callbacks.
`flue add` recipes inspect the existing project and apply its environment type
when one exists; they should not generate an unnecessary environment type for a
project that has none.

### Discovered channel route shape

File-based routing needs only a small internal structural shape between created
channel values and Flue's generated entry. A created channel exposes the route
declarations needed to serve it:

- one or more HTTP route declarations;
- each route's method and non-empty suffix;
- the Hono handler that performs verification, normalization, callback
  invocation, and response handling.

This is build interoperability, not a new channel runtime. Do not add a public
`@flue/runtime/channel` entrypoint, shared base class, versioned manifest
protocol, or separate package for it. First-party constructors and custom
project-owned channel definitions return the same documented structural route
shape. Generated-entry normalization validates it, and cross-package contract
tests prevent the first-party implementations from drifting.

Provider-specific clients, event types, identity helpers, and constructor
options remain outside this route shape. The generated entry normalizes
discovered channels and supplies their handlers to `configureFlueRuntime()`
through the same generated-entry/runtime configuration mechanism already used
for agents and workflows.

## File-based channel routing

Channels are a first-class build-time discovered application surface:

```txt
src/channels/stripe.ts
```

Each immediate file under `channels/` exports one named `channel` binding.
Flue discovers that binding and mounts its provider-declared HTTP surfaces. The
filename defines an immutable channel namespace:

```txt
/channels/<filename>/<provider-route>
```

The channel namespace itself is never an endpoint. Every HTTP surface has a
non-empty provider-owned suffix:

```txt
channels/stripe.ts   -> /channels/stripe/webhook
channels/github.ts   -> /channels/github/webhook
channels/slack.ts    -> /channels/slack/events
                        /channels/slack/interactions
channels/discord.ts  -> /channels/discord/interactions
```

Use `/webhook` as the default suffix for a provider with one ordinary webhook
surface. Reserve `/events` for a provider protocol explicitly named an Events
API. Use provider-native names such as `/interactions` when the route has
different request and response semantics.

The user cannot configure an individual discovered channel path. Renaming the
file intentionally changes its namespace. Provider packages own their fixed
route suffixes, and the build fails on duplicate or invalid method/path
declarations. Like agent and workflow routes, channel paths are immutable
relative to the `flue()` mount, not necessarily relative to the deployment
origin.

Route suffixes may contain multiple segments and should not be constrained
beyond what routing safety requires. They must be non-empty, begin with `/`,
contain no query or fragment, remain beneath `/channels/<filename>`, and not
duplicate another method/path declaration for the same channel.

An authored `app.ts` may mount `flue()` beneath an outer prefix or apply shared
middleware, but it cannot relocate one discovered channel independently:

```ts
app.route('/api', flue());
```

publishes the example Stripe route at `/api/channels/stripe/webhook`, just as it
prefixes agent and workflow routes. The file-based router remains the sole
authority for the path beneath the `flue()` mount. An application that needs
fully custom HTTP routing should implement an ordinary application-owned route
outside `channels/` instead of partially overriding a discovered channel.

`flue add` writes a path comment immediately above every generated handler:

```ts
// Path: /channels/stripe/webhook
async webhook({ c, event }) {
	// ...
}
```

For multiple surfaces:

```ts
// Path: /channels/slack/events
async events({ c, event }) {
	// ...
}

// Path: /channels/slack/interactions
async interactions({ c, interaction }) {
	// ...
}
```

These comments are developer education, not route configuration. They show the
default root-mounted path; when `flue()` is mounted beneath an application
prefix, that prefix is prepended. Recipes must update the comment when creating
or renaming the channel file. No expanded `flue dev` route listing is required
for this feature.

## Constructor-owned verified handlers

The constructor accepts the application handler that runs after protocol
verification and normalization. The returned channel definition exposes its
route declarations to Flue's generated build entry; application code does not mount
route factories:

```ts
export const channel = createGitHubChannel({
	webhookSecret: process.env.GITHUB_WEBHOOK_SECRET!,

	// Path: /channels/github/webhook
	async webhook({ c, event }) {
		switch (event.type) {
			case 'issues.opened':
			case 'pull_request.opened':
				await dispatch(assistant, {
					id: channel.conversationKey({
						owner: event.repository.owner,
						repo: event.repository.name,
						issueNumber:
							event.type === 'issues.opened'
								? event.payload.issue.number
								: event.payload.pullRequest.number,
					}),
					input: event,
				});
				return;

			case 'issue_comment.created':
				return;
		}
	},
});
```

The package handles everything before the switch:

- route method and path checks;
- body limits and exact-byte reading;
- signature verification and freshness checks;
- content-type parsing;
- provider application/workspace identity checks;
- protocol handshakes such as GitHub ping, Slack URL verification, and Discord
  PING;
- normalized discriminated event construction;
- handler deadline enforcement where required.

The handler receives one extensible named argument object containing the
authentic Hono `Context` as `c` and the verified normalized provider `event` or
`interaction`. Application code uses `c.json(...)`, `c.text(...)`, `c.body(...)`,
redirects, headers, and status APIs exactly as it does in an ordinary Hono
handler. The raw request remains available as `c.req.raw`, but its body has
already been consumed for verification; use the normalized provider value or
its explicit `raw` payload field for body data.

Keep `c` nested rather than spreading or augmenting it. Hono's context is a
class instance whose useful behavior may live on its prototype; `{ ...c,
event }` is not a real Hono context and may lose methods or accessors. A named
argument object also allows future additive metadata such as delivery or retry
information without positional third and fourth arguments.

Each discovered protocol surface has exactly one handler:

- GitHub: one webhook event handler;
- Slack: one Events API handler and one interactivity handler;
- Discord: one interaction handler.

Whether a provider surface is required or optional is provider-specific.
Optional callbacks that are omitted do not publish their routes. Generated
recipes show unused optional handlers as commented examples, including their
path comments, so developers can enable them when needed without exposing an
endpoint that silently accepts deliveries they did not intend to configure. A
provider constructor may require at least one callback or require a particular
surface when its protocol demands it.

The application uses a discriminated `switch` and may group several `case`
labels into one code path. There is no package-owned event registry, duplicate
registration state, user-authored mount call, or need to coordinate multiple
`on(...)` calls.

Constructors store application handlers but never invoke them synchronously.
They run only after a request reaches the corresponding route handler and
passes provider verification. This deferred-callback guarantee is part of the
public contract because project channel modules may participate in valid ESM
cycles with their target agents.

Every verified, non-protocol delivery invokes the application handler. Known
events use typed discriminated variants. Unsupported events use an explicit
fallback variant containing a stable fallback discriminator, the original
provider event/action/type identifier, provider delivery identity where
available, and `raw: unknown`. Protocol messages owned by the provider package,
such as GitHub ping, Slack URL verification, and Discord PING, are handled
internally and are not forwarded to the application handler.

### Handler responses

Do not introduce a Flue-specific response object. Handlers return:

- `undefined` for the route's documented default acknowledgement;
- a JSON-compatible value (`null`, boolean, finite number, string, array, or
  object composed recursively from those values) for a `200` JSON response;
- any ordinary Hono-produced `Response`, such as
  `c.json(value, 202)`, `c.text('ok')`, or `c.body(null, 204)`, for full status,
  header, and body control.

Examples:

```ts
async webhook({ c, event }) {
	if (await alreadyProcessed(event.id)) {
		return c.json({ duplicate: true }, 200);
	}

	await processEvent(event);
	return { received: true };
}
```

The channel adapter applies only a small amount of return handling:

1. `Response` values pass through unchanged.
2. `undefined` becomes the provider surface's default success response.
3. Other JSON-compatible values are validated and serialized with
   `c.json(value)`. Values such as functions, symbols, bigint, cyclic objects,
   non-finite numbers, or unsupported class instances are invalid.
4. Thrown handlers or unsupported return values become the documented failure
   response.

For ordinary webhook and notification surfaces, the default success response is
an empty `200`. Slack actions may also default to their valid empty
acknowledgement. A response-required protocol such as a non-PING Discord
interaction cannot truthfully default to an empty `200`; its handler must return
a JSON value or Hono `Response`, and `undefined` produces the
documented failure response.

Provider response protocols use provider-specific TypeScript return types so
application code receives static guidance about the expected wire shape. At
runtime, the channel validates only that a returned value is JSON-compatible;
it does not maintain a second exhaustive schema for Slack or Discord response
objects. The returned value is serialized as the webhook response body.
Applications may use provider SDK types with `satisfies` where useful, and a
Hono `Response` remains the explicit escape hatch for full response control.

## Future transport compatibility

Slack Socket Mode and Discord Gateway are not part of this migration. They
require connection lifecycle, reconnect, heartbeat, resume, and target-specific
hosting decisions that do not belong in an HTTP route API.

The implementation should nevertheless keep provider normalization separate
from HTTP verification and response serialization internally where that
separation is natural. A future long-lived transport could then feed the same
normalized discriminated event union into an application handler without
pretending that WebSocket acknowledgement and lifecycle semantics are Fetch
responses. Do not publish a transport-neutral base interface until a real
second transport demonstrates the shared contract.

## Target project shape

The provider module exports the names `channel` and `client`. It may also export
application-specific tools built from the SDK:

```ts
// src/channels/slack.ts
import { defineTool, dispatch } from '@flue/runtime';
import { createSlackChannel } from '@flue/slack';
import { WebClient } from '@slack/web-api';
import assistant from '../agents/assistant.ts';

export const client = new WebClient(process.env.SLACK_BOT_TOKEN!);

export const channel = createSlackChannel({
	signingSecret: process.env.SLACK_SIGNING_SECRET!,
	appId: process.env.SLACK_APP_ID!,
	teamId: process.env.SLACK_TEAM_ID!,

	// Path: /channels/slack/events
	async events({ c, event }) {
		switch (event.type) {
			case 'app_mention':
			case 'message':
				await dispatch(assistant, {
					id: channel.conversationKey({
						teamId: event.teamId,
						channelId: event.payload.channelId,
						threadTs: event.payload.threadTs ?? event.payload.messageTs,
					}),
					input: {
						type: `slack.${event.type}`,
						eventId: event.eventId,
						text: event.payload.text,
					},
				});
				return;
		}
	},

	// Path: /channels/slack/interactions
	async interactions({ c, interaction }) {
		switch (interaction.type) {
			case 'action':
				return;
			case 'view_submission':
				return {
					response_action: 'errors',
					errors: {
						email: 'Enter a valid email address.',
					},
				};
		}
	},
});

export const lookupSlackUser = defineTool({
	name: 'lookup_slack_user',
	description: 'Look up a Slack user by id.',
	parameters: {
		type: 'object',
		properties: { userId: { type: 'string', minLength: 1 } },
		required: ['userId'],
		additionalProperties: false,
	},
	async execute({ userId }) {
		return JSON.stringify(await client.users.info({ user: userId }));
	},
});
```

The canonical generated layout keeps provider setup, inbound handling, and
reusable provider tools together:

```txt
src/
  channels/
    slack.ts             # exports channel, provider SDK client, and optional tools
  agents/
    assistant.ts         # imports only the tools it needs
```

An ESM cycle between `channels/slack.ts` and `agents/assistant.ts` is acceptable
when imported agent bindings are read only inside constructor callbacks that
run after module evaluation. The channel constructor must not invoke those
callbacks synchronously. Tools exported by the channel module are initialized
before a created agent's initializer reads them. Examples and tests should make
this deferred-live-binding requirement visible so future refactors do not turn
it into an eager read.

Recipes may adapt filenames to an existing project, but `channels/<provider>.ts`
with `channel` and `client` exports is the canonical generated contract.
Application-specific tool exports may live in that file or a nearby tool module
when size or ownership makes a split clearer.

### Directional Stripe example

Stripe is not an implementation deliverable in this plan. It is a directional
example for future channels where the provider SDK itself supplies webhook
verification and event typing:

```ts
// src/channels/stripe.ts
import { defineTool, dispatch } from '@flue/runtime';
import createStripeChannel from '@flue/stripe';
import Stripe from 'stripe';
import billingAgent from '../agents/billing.ts';

export const client = new Stripe(process.env.STRIPE_SECRET_KEY!, {
	httpClient: Stripe.createFetchHttpClient(),
});

export const channel = createStripeChannel({
	client,
	webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,

	// Path: /channels/stripe/webhook
	async webhook({ c, event }) {
		switch (event.type) {
			case 'checkout.session.completed':
			case 'checkout.session.async_payment_succeeded':
				await dispatch(billingAgent, {
					id: event.data.object.customer?.toString() ?? event.id,
					input: {
						type: event.type,
						eventId: event.id,
						sessionId: event.data.object.id,
					},
				});
				return;

			case 'invoice.payment_failed':
				return c.json({ accepted: true }, 202);

			default:
				return;
		}
	},
});

export const lookupStripeCustomer = defineTool({
	name: 'lookup_stripe_customer',
	description: 'Look up a Stripe customer by id.',
	parameters: {
		type: 'object',
		properties: { customerId: { type: 'string', minLength: 1 } },
		required: ['customerId'],
		additionalProperties: false,
	},
	async execute({ customerId }) {
		return JSON.stringify(await client.customers.retrieve(customerId));
	},
});
```

This example intentionally passes the project-owned SDK client into the channel
because Stripe's SDK adds ingress value. It does not establish a universal
`client` constructor option for other providers.

## Tool authoring contract

No first-party package or connector recipe should install a generic provider
tool set.

The recipe instructs the coding agent to:

1. Determine the specific provider actions required by the user's agent.
2. Inspect the installed SDK's types and provider documentation for those
   actions.
3. Define explicit `defineTool(...)` values in application code.
4. Bind credentials and destination references in trusted code.
5. Expose only action content and intentionally model-selectable options as tool
   arguments.
6. Keep arbitrary channel ids, repository names, API paths, webhook response
   URLs, interaction tokens, and credentials out of model arguments unless the
   application has an explicit authorization design for them.
7. Handle provider errors and idempotency according to the operation's actual
   semantics rather than through a Flue-wide wrapper.

Conversation keys remain identifiers, not authorization capabilities. A direct
agent route must authorize a caller-selected instance id before an initializer
uses it to bind provider SDK calls.

## Provider SDK selection

Before writing the three named recipes, verify the current provider SDK choices
against their primary documentation and package source.

For each provider, record:

- the established SDK package and import used for outbound API calls;
- Node.js and Cloudflare/workerd compatibility;
- whether the SDK supports injected or standards-based Fetch;
- authentication and initialization requirements;
- whether a narrower REST client is preferable to a gateway or long-lived
  connection client;
- package size or runtime constraints that materially affect a Flue target.

Prefer a provider-maintained official SDK. Where the provider has no official
JavaScript SDK, use the dominant maintained library and state that distinction
accurately. Do not introduce Socket Mode, Discord Gateway, or another
long-lived transport merely to obtain an outbound REST client.

If one SDK does not support both Flue targets, the recipe must branch on the
project target or recommend a target-compatible provider client. Do not make
the ingress package depend on the outbound SDK to force artificial parity.

## `flue add` integration

Add a `channel` connector category to the existing Markdown recipe registry:

```txt
connectors/
  channel.md
  channel--github.md
  channel--slack.md
  channel--discord.md
```

The named recipes are addressed as:

```sh
flue add github
flue add slack
flue add discord
```

The generic category supports:

```sh
flue add <provider-docs-url> --category channel
```

The generic recipe teaches a coding agent to implement a project-owned channel
from provider documentation using:

- a verified Fetch ingress handler or a first-party ingress package when one
  exists;
- explicit `dispatch(...)`;
- the provider's established SDK for outbound operations;
- application-specific `defineTool(...)` definitions.

It must not imply that every provider needs a published Flue package or common
provider constructor API. A custom discovered channel still exports the minimal
structural route declarations required by file-based routing.

### Named recipe requirements

Each GitHub, Slack, and Discord recipe must:

1. Detect the Flue source root using the existing `.flue/`, `src/`, root
   precedence.
2. Inspect the target runtime, package manager, app entrypoint, and existing
   agent modules before editing.
3. Install `@flue/<provider>` and the selected provider SDK with the project's
   package manager.
4. Create `channels/<provider>.ts` exporting `channel` and `client`.
5. Define constructor callbacks that switch over normalized provider events and
   route chosen cases to a created agent through `dispatch(...)`.
6. Add the exact default root-mounted path comment above each constructor
   callback.
7. Show unused optional provider surfaces as commented handler examples with
   their path comments. Do not publish a route until its callback is enabled.
8. Add only tools justified by the user's requested behavior. If the desired
   outbound behavior is not known, leave a focused SDK usage example and ask
   rather than installing a broad generic tool collection.
9. Preserve provider delivery ids in dispatched input when useful for
   application idempotency.
10. Keep raw payloads and short-lived capabilities out of model-visible or
   durable dispatched input.
11. Update the project's environment documentation when an appropriate file or
    convention exists, without inventing secret values.
12. Run the project's typecheck and relevant build or tests.

The recipes should contain complete canonical source examples but permit the
coding agent to integrate with existing project structure rather than writing
files verbatim over user code.

## Implementation phases

### Phase 1: contract and SDK research

1. Audit the package-visible declarations for all three channel packages and
   classify every export as ingress, identity, shared response serialization,
   or outbound-only.
2. Define the minimal internal discovered-channel route shape and
   generated-entry normalization needed for method, suffix, and handler lookup.
3. Add one small channel fixture that uses the route shape and prove both
   generated Node and Cloudflare applications can discover and serve it without
   `app.ts`.
4. Verify the provider packages' emitted declarations compile in a clean
   consumer with their direct Hono dependency and without `@flue/runtime`.
5. Verify the provider SDK choice and target compatibility for GitHub, Slack,
   and Discord.
6. Sketch the generated source for all three providers side by side:
   `channel`, `client`, constructor callbacks, discovered paths, and one
   application-owned tool example.
7. Finalize the per-route Hono handler context, JSON response type, default
   acknowledgement, and response-required behavior for GitHub, Slack Events
   API, Slack interactivity, and Discord interactions.
8. Define each provider's typed known-event variants and explicit unknown-event
   fallback variant.
9. Decide whether each provider constructor benefits from an application-owned
   SDK client for ingress verification or typing; do not force consistency.
10. Decide which callbacks are required or optional for each provider. Omitted
    optional callbacks must omit their routes.
11. Review the sketches for consistent ownership without forcing provider API
   or response uniformity.
12. Record any target-specific recipe branch before implementation.

The discovered-channel fixture and generated-entry proof are a hard
gate for Phase 2. They prevent provider packages from being migrated to an API
that the build cannot yet mount.

### Phase 2: remove outbound package surfaces

For each of `packages/github`, `packages/slack`, and `packages/discord`:

1. Remove `src/client.ts`.
2. Remove `defineTool` and `ToolDefinition` imports.
3. Remove `.client` and `.tools` from the public channel interface and returned
   object.
4. Replace `on(...)`, `onAction(...)`, `onView(...)`, `onCommand(...)`,
   `onComponent(...)`, and `onModal(...)` plus their mutable maps with one
   constructor callback per configured protocol surface.
5. Replace user-facing route factories with the small channel route declarations
   consumed by generated-entry normalization.
6. Give every declared HTTP surface a fixed non-empty provider-owned suffix;
   use `/webhook` for single ordinary webhook surfaces.
7. Allow provider-specific optional callbacks to be omitted and leave their
   routes out of the returned declarations.
8. Define every callback with one extensible named argument object such as
   `({ c, event })` or `({ c, interaction })`; preserve the authentic Hono
   `Context` under `c` rather than spreading or augmenting it.
9. Guarantee and test that constructors store callbacks without invoking them
   during module evaluation.
10. Remove outbound credentials and transport options from constructor options.
11. Remove outbound-only types and error classes while preserving ingress,
   response, and identity types.
12. Remove `@flue/runtime` peer and development dependencies when no remaining
   source or test imports require them.
13. Add `hono` as a direct dependency for public handler context types and route
    execution.
14. Delete outbound client and tool tests. Retain and, where necessary, adjust
   observable ingress, handler, identity, malformed-input, and workerd tests.
15. Replace duplicate-registration and unsubscribe tests with tests for one
    constructor callback receiving grouped discriminated events, default
    acknowledgement, plain JSON returns, Hono `Response` passthrough, thrown
    handlers, invalid return values, response-required surfaces, and
    the explicit unknown-event fallback.
16. Test that omitted optional callbacks omit their routes and configured empty
    callbacks receive deliveries and return the documented default response.
17. Update constructor tests to reflect ingress-only configuration and trusted
   identity snapshotting.
18. Rebuild declarations and verify the packages compile in a clean consumer
    with Hono and without `@flue/runtime`.

Do not weaken the existing exact-body, signature, deadline, response
serialization, or workerd coverage while changing handler ownership.

### Phase 3: add channel discovery and generated routing

1. Add `channels/` discovery beside existing agent and workflow discovery.
2. Discover immediate channel files only; nested files remain ordinary support
   modules.
3. Require each discovered module to export a valid named `channel` binding
   conforming to the Phase 1 route shape.
4. Follow the existing agent/workflow path: generated entries import discovered
   channel modules, normalize their route declarations, and pass the resulting
   handler lookup to `configureFlueRuntime()`.
5. Add one stable channel route family to `flue()` that resolves the configured
   channel name, method, and suffix at request time, just as agent and workflow
   route handlers resolve generated runtime configuration.
6. Derive `/channels/<filename>` from the discovered module name and append the
   provider-declared non-empty suffix.
7. Reject duplicate method/path combinations, invalid filenames, and suffixes
   that are empty, contain a query or fragment, or escape the channel namespace.
8. Preserve the existing authored `app.ts` contract: it may mount all of
   `flue()` beneath a prefix or middleware, but does not individually relocate
   discovered channels.
9. Preserve the existing requirement that a project contain at least one agent
   or workflow; channels alone do not make a valid Flue application.
10. Update dev reload discovery so changes under `channels/` rebuild or reload
   the application.
11. Add Node and Cloudflare build coverage for no-`app.ts`, root-mounted
   `app.ts`, and prefixed `flue()` composition.

### Phase 4: add channel recipes to `flue add`

1. Add the `channel` category root and three provider recipes.
2. Update `connectors/README.md` to support multiple recipe categories and
   document channel-specific body conventions separately from sandbox
   connector conventions.
3. Regenerate `packages/cli/bin/_connectors.generated.ts`.
4. Update CLI help and examples so `flue add slack` is a first-class example
   and category hints describe both `sandbox` and `channel`.
5. Update the `flue add` documentation category table and examples.
6. Add focused CLI/registry coverage for:
   - named channel recipe resolution;
   - channel category-root resolution and URL substitution;
   - listing output and category labels;
   - served recipe Markdown with frontmatter removed;
   - slug and alias collision validation across categories.
7. Exercise each recipe through the same agent-facing output path used by
   published `flue add`.

The existing fetch-and-print CLI architecture is sufficient; do not add a
second installer or direct file-writing path.

### Phase 5: migrate examples

Update `examples/github-channel`, `examples/slack-channel`, and
`examples/discord-channel` to represent the source produced by their recipes:

1. Add the selected provider SDK dependency.
2. Export `channel` and `client` from `src/channels/<provider>.ts`.
3. Define inbound constructor callbacks in `src/channels/<provider>.ts` and
   rely on file-based discovery for routing.
4. Remove all first-party `.client` and `.tools` usage.
5. Define one narrow application-owned tool in each example using
   `defineTool(...)` and the provider SDK, colocated in the channel module unless
   a split is materially clearer.
6. Bind the parsed conversation destination in the agent initializer.
7. Keep the examples buildable and type-checkable without live credentials or
   network calls.
8. Make clear that the example tool is application policy, not a recommended
   universal tool set.
9. Exercise the channel↔agent ESM cycle through the application entrypoint and
   webhook path, proving imported agent bindings are read only after module
   evaluation.
10. Put the exact default path comment above each generated handler and verify
    it matches the discovered filename and provider suffix.
11. Show any unused optional provider surface as a commented handler example
    rather than publishing an empty route.

Use injected or fake SDK transport only if needed for deterministic tests; do
not add a new Flue client abstraction around the SDK.

### Phase 6: rewrite documentation and release metadata

Revise the documentation around one canonical story:

> Flue channel packages receive and verify provider events. `flue add` creates
> editable project integration code using the provider SDK. The application
> defines its own tools.

Required updates:

1. **Channels guide**
   - describe first-party packages as ingress packages;
   - make `flue add github|slack|discord` the recommended setup path;
   - explain the generated `channel` and `client` exports;
   - explain why tools are application-owned;
   - retain acknowledgement, replay, identity, and target-runtime guidance.
2. **Provider setup guides**
   - lead with `flue add <provider>`;
   - show constructor-owned verified handlers and automatic file-based routing;
   - show the generated path comment above every handler;
   - demonstrate grouped discriminated `switch` cases;
   - show one explicit SDK-backed tool as an example, not a package API;
   - explain that a deferred channel↔agent ESM cycle is supported;
   - distinguish webhook/verification credentials from outbound SDK
     credentials.
3. **Provider API references**
   - remove client, tool, outbound option, and outbound error documentation;
   - retain complete ingress, named Hono handler context, default
     acknowledgement, statically typed provider responses, JSON runtime
     validation, response-required, and identity references;
   - document which provider callbacks are optional and that omitted callbacks
     do not publish routes.
4. **Build a custom channel**
   - recommend provider SDKs for outbound APIs;
   - frame tool design as application authorization and policy;
   - remove the fixed-origin client checklist as a Flue-owned abstraction while
     retaining relevant security guidance for application code.
5. **Tools guide**
   - add or refine one provider SDK-backed example showing trusted destination
     binding and narrow arguments.
6. **CLI add reference and overview**
   - document the `channel` category and named provider recipes.
7. **Project layout and routing**
   - add `channels/` as a discovered source directory;
   - document immutable filename-derived namespaces and provider-owned suffixes;
   - explain `app.ts` outer prefixes without implying per-channel relocation.
8. **Package READMEs**
   - describe ingress-only package behavior and point to `flue add`.
9. **Navigation and related links**
   - retain provider guides and references, but ensure titles and descriptions
     do not promise outbound clients or tools.
10. **Changelog**
   - revise the unreleased channel entry in place because the packages have not
     been published; do not describe removed pre-publication APIs as shipped
     breaking changes.
11. **Prepared package docs**
    - regenerate through `scripts/prepare-publish.mjs`; do not treat copied
      `packages/*/docs` trees as independent sources.

Search the full docs and examples tree for stale claims including
`channel.client`, `channel.tools`, fixed-origin provider clients, pre-scoped
tools, outbound token constructor options, and `@flue/runtime` channel peer
dependencies.

### Phase 7: validation and review

Run dependency-ordered validation:

```sh
pnpm --filter @flue/github run build
pnpm --filter @flue/github run check:types
pnpm --filter @flue/github run test
pnpm --filter @flue/github run test:workerd

pnpm --filter @flue/slack run build
pnpm --filter @flue/slack run check:types
pnpm --filter @flue/slack run test
pnpm --filter @flue/slack run test:workerd

pnpm --filter @flue/discord run build
pnpm --filter @flue/discord run check:types
pnpm --filter @flue/discord run test
pnpm --filter @flue/discord run test:workerd

pnpm --filter github-channel-example run check:types
pnpm --filter github-channel-example run build
pnpm --filter slack-channel-example run check:types
pnpm --filter slack-channel-example run build
pnpm --filter discord-channel-example run check:types
pnpm --filter discord-channel-example run build

pnpm --dir packages/cli run build
pnpm --dir packages/cli run test
pnpm --dir apps/docs run check
pnpm --dir apps/docs run build
npm run check
```

Also:

1. Run each named recipe end to end against a clean Flue fixture using a coding
   agent or deterministic recipe-install harness.
2. Type-check the resulting project with the selected provider SDK installed.
3. Verify Node builds for all generated integrations.
4. Verify any recipe claiming Cloudflare support against an actual workerd or
   Cloudflare build, including the provider SDK import.
5. Prepare package artifacts and inspect declarations and discovered route
   shapes.
6. Confirm the channel packages no longer depend on `@flue/runtime`.
7. Confirm package tarballs contain ingress implementations and declarations
   but no outbound client modules.
8. Run scoped formatting, lint, `git diff --check`, and the root check.
9. Perform one focused review covering package API contraction, recipe
   security, generated tool ownership, target compatibility claims, and stale
   documentation.

## Test strategy

Package tests continue to protect the provider boundary:

- signed `Request` in, normalized handler input and provider `Response` out;
- exact raw-body verification;
- provider handshakes and identity mismatch rejection;
- methods, paths, content types, malformed payloads, and body limits;
- one-handler route ownership, grouped event cases, deadlines, and failures;
- default acknowledgements, plain JSON serialization, and Hono `Response`
  passthrough;
- provider-specific static response types with JSON-compatibility validation at
  runtime;
- required responses for protocols where an empty `200` is invalid;
- surfaced delivery identity and retry metadata;
- canonical conversation-key round trips;
- Node and workerd compatibility.

Recipe and example tests protect composition:

- the correct ingress and SDK packages are installed;
- `channel` and `client` are exported from project code;
- a constructor callback dispatches grouped event cases to the intended agent
  instance;
- callbacks receive an extensible `{ c, event }` or `{ c, interaction }` object
  and can return `c.json(...)`, `c.text(...)`, or another Hono response;
- discovered channel files mount without an authored `app.ts`;
- every route lives beneath `/channels/<filename>/<non-empty-suffix>`;
- single ordinary webhook providers use `/webhook`;
- multi-route providers use stable provider-native suffixes;
- omitted optional callbacks do not publish routes, while configured empty
  callbacks return the documented default acknowledgement;
- generated path comments match the default discovered route;
- an outer `flue()` mount prefix applies uniformly to all discovered channels;
- channel constructors do not invoke application callbacks eagerly;
- the documented channel↔agent ESM cycle imports and executes successfully;
- SDK-backed tools are defined by the application;
- credentials and destinations are absent from tool arguments;
- generated projects type-check and build without live credentials;
- target-specific SDK claims are tested rather than inferred.

Do not replace deleted package-client tests with tests of provider SDK
internals.

## Non-goals

- A universal channel runtime or provider client interface.
- A universal HTTP response type across provider notifications and
  interactions.
- A Flue-specific webhook response-object schema.
- Generic reply, reaction, label, moderation, or message tools.
- Per-channel path customization.
- Serving requests directly from `/channels/<name>` without a route suffix.
- User-authored mounting of discovered first-party channel route factories.
- Automatic exposure of an SDK client to the model.
- Dynamic OAuth installation storage or multi-workspace credential resolution.
- Slack Socket Mode or Discord Gateway support.
- Agent-driven use of Slack `response_url` or Discord interaction tokens.
- Flue-owned retries, rate-limit normalization, or provider error hierarchies
  for outbound SDK calls.
- Direct file mutation by the `flue add` CLI itself.

## Decision log

| Decision | Choice |
| --- | --- |
| First-party package responsibility | Verified inbound protocol handling and identity only |
| Outbound API responsibility | Project-owned established provider SDK |
| Tool responsibility | Application developer; explicit `defineTool(...)` values |
| Installation experience | `flue add <provider>` agent-facing Markdown recipe |
| Generated exports | `channel` and `client` from `channels/<provider>.ts` |
| Handler API | One constructor callback per provider protocol surface |
| Optional surfaces | Provider-specific; omitted callbacks do not publish routes |
| Handler argument | Extensible named object containing authentic Hono `Context` as `c` plus provider input |
| Handler response | `undefined`, JSON-compatible value, or ordinary Hono `Response` |
| Response validation | Provider-specific TypeScript type; JSON compatibility only at runtime |
| Default response | Empty `200` where the provider protocol permits it; required payload otherwise |
| Route discovery | Immediate `channels/<name>.ts` files at build time |
| Route wiring | Same generated-entry/runtime configuration pattern as agents and workflows |
| Channel namespace | Immutable `/channels/<name>` derived from filename |
| Route suffix | Fixed provider-owned non-empty suffix; `/webhook` for a single ordinary webhook |
| Path customization | None per discovered channel |
| Path education | Generated `// Path: ...` comment above each handler |
| Tool placement | Project-owned exports, colocated with the SDK client by default |
| Module cycles | Supported when imported bindings are read only in deferred callbacks/initializers |
| Runtime dependency | Remove `@flue/runtime` from provider packages when outbound tools are deleted |
| Hono dependency | Direct dependency of each provider package; applications declare their own when authoring `app.ts` |
| Destination binding | Trusted application code using parsed conversation identity |
| Unsupported providers | Generic `channel` recipe from provider docs/source |
| Target parity | Verify per SDK; branch recipes where necessary |
| Release treatment | Revise unreleased API before first publication |

## Completion criteria

The migration is complete when:

- all three channel packages expose ingress, handler, response, and identity
  APIs only;
- constructors accept one application callback per configured protocol surface;
- provider-specific optional callbacks omit their routes when absent;
- channel definitions declare fixed non-empty provider route suffixes and invoke
  configured callbacks only after request verification;
- applications can group multiple event cases in one handler without mutable
  event registration;
- channel constructors never invoke application callbacks synchronously;
- handlers use normal Hono response APIs, plain JSON returns serialize as JSON,
  provider response shapes are statically typed, and runtime validation is
  limited to JSON compatibility;
- omitted responses default to success only where the provider protocol permits
  an empty acknowledgement;
- their constructors no longer accept outbound API credentials or transport
  options;
- no provider package contains a provider REST client or tool factory;
- no provider package depends on `@flue/runtime`;
- each provider package directly depends on Hono;
- `channels/<name>.ts` files are discovered and mounted without requiring
  `app.ts`;
- generated entries configure discovered channel handlers through the same
  runtime mechanism used by agents and workflows;
- channels do not satisfy the existing requirement for at least one agent or
  workflow;
- `/channels/<name>` is never itself an endpoint;
- every generated handler includes an accurate default path comment;
- `flue add github`, `flue add slack`, and `flue add discord` produce coherent
  agent-facing installation recipes;
- the generic `channel` recipe supports unsupported providers;
- generated provider modules export `channel` and the selected SDK `client`;
- examples define their own narrow SDK-backed tools and verify the documented
  deferred channel↔agent ESM cycle;
- docs consistently explain ingress ownership, SDK ownership, and
  application-owned tools;
- Node and claimed Cloudflare target behavior is verified with the actual SDKs;
- package, CLI, example, docs, artifact, and focused review gates pass;
- the unreleased changelog and package artifacts describe only the final public
  contract.
