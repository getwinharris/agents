# Channel Follow-Ups Roadmap

## Status

The original ten-provider first-party channel plan and the seven eligible
follow-up providers are implemented and audited. The portfolio now contains
17 release-ready HTTP channel packages. This document records implementation
evidence, release work, deferred product decisions, and candidate expansions
without reopening the completed ingress design.

Scope decisions confirmed after implementation:

- channel examples prove Node and Cloudflare compatibility; they are not
  turnkey deployment projects and do not own Wrangler migration history;
- provider installation, credentials, webhook registration, and outbound
  behavior are developer-owned application concerns, not future channel-core
  work;
- long-lived transports are unsupported for now; a provider that requires one
  is ineligible until Flue intentionally adds that transport class;
- recurring conformance work should be captured as an agent skill, not a
  repository script.

## Principles

- Preserve the current ownership boundary: Flue owns verified ingress,
  provider identity, protocol responses, and routing; applications own SDK
  clients, credentials, tools, and broad outbound behavior.
- End the first-party channel responsibility at successful HTTP webhook
  receipt and response. App installation and lifecycle management remain
  outside the core even when a provider commonly pairs them with webhooks.
- Require Node and Cloudflare Workers execution for every canonical path.
- Treat Flue's required `nodejs_compat` configuration as the canonical
  Cloudflare runtime. Node API usage is acceptable when Cloudflare implements
  the required behavior; actual workerd execution remains mandatory.
- Add provider-specific behavior only when official protocol semantics justify
  it. Do not introduce a universal event schema, outbound client, or tool set.
- Do not add a provider whose useful ingress requires a socket, polling loop,
  or other long-lived process under the current channel model.
- Continue using primary provider sources and original synthetic fixtures.

## 1. Release The Completed Channels

This is the immediate next milestone.

- Choose the release version and publish the 17 `@flue/*` channel packages
  together with the runtime and CLI changes they require.
- Deploy `apps/www` so the public connector registry serves all ten named
  recipes before announcing `flue add <provider>`.
- Publish the updated documentation and verify every public guide, API page,
  and connector markdown URL.
- Repeat the packed-artifact consumer check against the actual published
  versions.

Release exit criteria:

- every package is installable from the registry;
- every public `flue add` command returns the intended recipe;
- Node and Cloudflare examples build from published artifacts;
- no guide points at an unpublished package or undeployed connector.

The existing missing-Durable-Object-migration warning is not a channel release
blocker. These examples are compatibility and integration fixtures, not
deployment-ready Wrangler projects, and the channel plans never committed to
owning deployment migration history.

## 2. Channel Conformance Agent Skill

Complete. The repository now contains `.agents/skills/channel-conformance/`
and the seven follow-up providers were implemented and audited through that
workflow.

The final audit required judgment as well as commands, so it should not become
another repository-owned script.

- Add a repository agent skill for researching, implementing, auditing, and
  releasing one first-party HTTP channel.
- Teach the skill to inspect the current provider package and example set
  rather than relying on a hard-coded list.
- Let the skill delegate independent provider research, package review,
  workerd review, docs review, and artifact inspection to subagents when useful.
- Require delegated subagents not to spawn their own subagents.
- Require the implementing agent to reconcile subagent findings and retain
  responsibility for final correctness.
- Include package build, strict types, Node tests, workerd tests, Node and
  Cloudflare example builds, fake outbound transports, packed artifacts, clean
  consumers, connector output, documentation consistency, and focused security
  review.
- Keep provider protocol assertions in provider suites. The skill should
  orchestrate and audit durable public contracts, not duplicate them in a
  generic test harness.

## 3. Core Non-Goals

The following are intentionally outside the first-party channel core:

- app, bot, account, and marketplace installation flows;
- OAuth callbacks, consent, credential encryption, refresh, rotation, and
  revocation;
- tenant or workspace credential lookup;
- webhook registration, renewal, and unregistration;
- broad outbound provider APIs, tools, rich UI builders, uploads, history, and
  search;
- application authorization policy and provider-backed idempotency claims;
- multi-tenant installation orchestration.

Examples and connector guides may explain the minimum configuration needed to
receive a webhook, but Flue should not grow core abstractions for these
application responsibilities. Conversation keys remain identifiers, never
authorization capabilities.

## 4. Expand Existing HTTP Surfaces Only From Concrete Demand

Expand packages only when verified ingress normalization or provider response
semantics require package work. Keep outbound behavior in project-owned
clients and tools.

- Slack: richer HTTP event families and attachment metadata.
- Discord: richer HTTP interaction families and command registration guidance.
- Teams: additional HTTP activity families and file-card metadata that arrives
  directly in verified activity payloads.
- Google Chat: Workspace Events subscription lifecycle, cards, reactions, and
  other verified HTTP event families.
- Linear: broader issue and project events plus agent-activity policy examples.
- Telegram: additional webhook Update families, typing, and media examples.
- WhatsApp: additional incoming message, status, media, Flow callback, and edit
  semantics when Meta documents a stable protocol.
- Twilio: add Messaging webhook families only; treat Voice, Conversations, and
  Verify as separate provider-channel research.
- Messenger: additional incoming webhook families only after concrete demand.

## 5. Research New First-Party Channels

Each candidate starts with the same clean-room provider process. It is eligible
only when its useful inbound integration fits stateless HTTP webhook receipt
and has a defensible Node and Cloudflare Workers path. Defer it immediately if
it requires a long-lived transport, provider-managed process, Node-only
runtime, or installation system inside Flue core.

### Stripe

High priority because the channel API was originally shaped around Stripe's
verified event construction model and Stripe webhooks are common agent
triggers.

- Verify the current Stripe SDK's exact request-byte verification path in
  workerd.
- Support a fixed `/webhook` route with typed `Stripe.Event` delivery if the
  official SDK executes on both targets.
- Keep all Stripe API operations and tools project-owned through the exported
  SDK client.

### Inbound Email / Resend

High priority for support, sales, and operations agents. Vercel's public adapter
directory highlights inbound email through Resend as a useful platform class.

- Research Resend inbound email webhook verification, batching, attachment
  retrieval, retries, and canonical thread identity.
- Prefer the official Fetch-based client if it passes workerd.
- Treat outbound email composition and reply policy as project-owned behavior.

### Notion

- Confirm the current webhook verification, supported event families, retry
  behavior, workspace identity, and resource identity.
- Ship only if useful inbound behavior works with developer-owned OAuth and
  installation state.

### Shopify

- Research webhook HMAC verification, topic and shop identity, retry behavior,
  API versioning, batching, and stable resource identity.
- Keep app installation, access tokens, and outbound Admin API behavior
  developer-owned.

### Intercom

- Research webhook verification, workspace identity, delivery retries, event
  families, and stable conversation or ticket identity.
- Do not take ownership of app installation, OAuth, inbox policy, or outbound
  support operations.

### Zendesk

- Research webhook authenticity, account identity, ticket and conversation
  event semantics, retries, and any provider-required response behavior.
- Defer if a trustworthy inbound path requires a long-lived integration
  service rather than developer-owned setup plus stateless webhooks.

### Salesforce

- Research Salesforce's current stateless HTTP delivery surfaces separately
  from Pub/Sub API, Change Data Capture, and other long-lived event streams.
- Identify whether an official authenticated webhook mechanism provides useful
  provider-native events, delivery identity, retry semantics, and stable
  organization and resource identity without requiring Flue to own Salesforce
  installation or subscription lifecycle.
- Implement only if the canonical ingress and an application-owned outbound
  client both execute reliably in Node and Cloudflare Workers. Otherwise
  record the eligible subsets or transport blocker and defer the channel.

### Salesforce Marketing Cloud implementation — 2026-06-13

Status:

- Complete.

Primary sources:

- Salesforce Marketing Cloud Engagement Event Notification Service overview,
  setup, activity sequence, callback creation and verification, notification
  signing, retries and callback suspensions, OAuth callback authentication,
  supported event families, and representative event payload documentation.
- Salesforce Platform Pub/Sub API, Change Data Capture, Platform Events,
  Streaming API, and Outbound Messaging documentation.
- Salesforce REST API OAuth and tenant-specific endpoint documentation.
- Current Cloudflare Workers Fetch, Web Crypto, Node.js compatibility, and
  workerd-testing documentation.

Clean-room affirmation:

- The design and future fixtures derive from Salesforce and Cloudflare primary
  specifications and original synthetic payloads. No third-party adapter
  implementation, types, fixtures, payloads, snapshots, or tests are being
  copied or translated.

Eligibility:

- A generic Salesforce channel is not eligible. Core Salesforce CRM event
  delivery is primarily gRPC or CometD subscriber transport, while SOAP
  Outbound Messaging relies on transport-level client certificates and
  customer-defined endpoint controls rather than a portable signed payload
  contract available to a Hono handler.
- Marketing Cloud Engagement Event Notification Service is independently
  eligible. ENS verifies callback ownership with a one-time JSON payload and
  then delivers batches of provider events by stateless HTTPS `POST`.
- ENS signs the entire exact notification payload with HMAC-SHA256 using a
  callback-specific signature key and sends the base64 signature in
  `x-sfmc-ens-signature`.
- ENS delivery is at least once. A callback has three seconds to return `200`,
  `201`, `202`, `203`, or `204`; failed delivery is retried immediately and
  then at decreasing intervals for up to seven days.
- Data 360 webhook Data Action Targets appear separately eligible but remain a
  future provider-specific research item because current documentation leaves
  exact JSON signing canonicalization and delivery semantics less explicit.

Design:

- Add `@flue/salesforce-marketing-cloud`,
  `examples/salesforce-marketing-cloud-channel`,
  `flue add salesforce-marketing-cloud`, a setup guide, and an API reference.
  Do not alias this as generic `salesforce`; the package supports Marketing
  Cloud Engagement ENS, not the CRM platform as a whole.
- Publish one fixed `POST /events` route.
- Accept optional `signatureKey`, optional `callbackId`, `bodyLimit`,
  `handlerTimeoutMs`, an optional setup-only `verification` callback, and a
  required signed-batch `events` callback.
- Recognize only the exact unsigned callback-verification shape containing
  `callbackId` and `verificationKey`. Reject unsigned requests when no
  `verification` handler is configured; otherwise deliver the challenge to
  setup code and return `200`. Do not treat it as authenticated application
  ingress.
- Require the callback signature key before accepting notification batches.
  Use the opaque callback `signatureKey` string directly as the UTF-8 HMAC key,
  base64-decode only `x-sfmc-ens-signature`, verify the exact body bytes with
  Web Crypto before UTF-8 decoding or JSON parsing, and optionally restrict the
  verification callback id.
- Deliver one typed batch containing open provider-native events. Validate the
  durable fields shared by the documented families: non-empty
  `eventCategoryType` and nonnegative integer `timestampUTC`. Normalize
  `compositeId`, `mid`, `eid`, and JSON `info` only when present and valid;
  preserve future event families and all additional provider fields.
- Expose the exact verified body and ordered event array. Do not claim a
  universal delivery id or conversation key across email, SMS, OTT,
  MobilePush, and Automation Studio. `compositeId` is absent from some
  families and is deprecated for transactional email; applications use
  family-specific native identity for deduplication.
- Apply a complete-route deadline defaulting to and capped at 2500ms, leaving
  time before ENS's three-second timeout. Channel-owned callback failure,
  invalid result, or timeout returns `500` so ENS retries.
- Preserve ordinary handler results, but document that only `200` through
  `204` acknowledge ENS delivery. No value and JSON produce `200`; an
  application-returned `Response` passes through unchanged.

Dependencies and example:

- `@flue/salesforce-marketing-cloud` depends only on Hono and Web Crypto. It
  does not depend on a Salesforce SDK or `@flue/runtime`.
- The editable example exports a narrow project-owned Fetch client using a
  trusted tenant-specific Marketing Cloud REST origin and application-owned
  OAuth access token. It does not use `@salesforce/core`, whose primary
  contract is Salesforce CLI and DX tooling rather than Workers applications.
- The example handles selected transactional and engagement email events with
  grouped switch cases, derives application identity only from fields
  validated for those event families, and dispatches each event separately
  while acknowledging the provider batch once.
- Node and workerd tests will execute the same Fetch client against a
  fail-closed fake transport under Flue's canonical `nodejs_compat`
  configuration.

Non-goals and deferrals:

- Callback creation and verification API calls, subscription creation,
  subscription filters, OAuth installation, token storage and refresh, IP
  allowlisting, deduplication, persistence, event replay, and broad Marketing
  Cloud outbound tools.
- Salesforce CRM Pub/Sub API, Change Data Capture, Platform Events subscriber
  transport, Streaming API, and generic Apex or Flow callout payloads.
- SOAP Outbound Messaging until Flue intentionally supports transport-level
  client-certificate identity as part of the channel contract.
- Salesforce Data 360 webhooks until their exact signing and retry semantics
  are sufficiently documented and independently tested.

Foundation reflection to revisit after implementation:

- Whether a provider batch callback fits the existing single-object handler
  contract without shared batching machinery.
- Whether an unsigned one-time setup callback plus later signed traffic
  reveals any reusable setup-route pattern or should remain provider-specific.
- Whether strict acknowledgment status ranges need any shared representation
  beyond provider documentation and tests.

Implementation:

- Added `@flue/salesforce-marketing-cloud` with one fixed `POST /events`
  route. It handles the unsigned callback-ownership challenge only when a
  setup handler is configured, authenticates signed ENS batches over the exact
  request bytes, preserves provider order and open event fields, enforces the
  documented 1000-event limit, and applies a complete-route deadline below
  Salesforce's three-second response limit.
- Added original Node and workerd suites covering the literal opaque signature
  key, valid and changed exact bytes, malformed signatures, setup verification,
  callback-id restrictions, media and body failures, invalid UTF-8 and JSON,
  streamed and declared limits, common and family-dependent fields, maximum
  batch size, handler results, application failure, deadlines, route
  publication, and Hono environment typing.
- Added `examples/salesforce-marketing-cloud-channel` with a project-owned
  tenant-bound Fetch client, grouped transactional and engagement email event
  handling, application-local email identity, ordered dispatch with one batch
  acknowledgment, and a callback-lookup tool bound to trusted callback and
  credential configuration.
- Added `flue add salesforce-marketing-cloud`, the connector recipe, setup and
  API documentation, navigation and channel overview entries, README,
  changelog, lockfile, and publish preparation coverage.

Validation:

- Package build and strict typecheck pass. Twelve Node ingress tests and three
  workerd ingress tests pass; workerd executes valid, changed, and malformed
  exact-body signatures, setup verification, family-shape differences,
  streamed limiting, and normal handler results with `nodejs_compat`.
- Example strict typecheck passes. Three Node tests and one workerd test
  execute the project-owned callback client against fail-closed Fetch and
  validate the trusted Marketing Cloud tenant origin and local email
  identity. Node and Cloudflare target builds pass.
- A built Node application returned `204` for an original locally signed
  future event batch and `401` for the changed body with the original
  signature.
- The generated full Flue Cloudflare Worker ran through Wrangler's local
  workerd runtime with its actual `nodejs_compat` configuration and bound
  environment variables. The same original and changed requests returned
  `204` and `401`.
- The full CLI suite passes: 57 Node tests and 24 Vitest tests. The generated
  connector index lists Salesforce Marketing Cloud, the built CLI prints the
  intended recipe, and the connector website build serves
  `/cli/connectors/salesforce-marketing-cloud.md`.
- Documentation check and production build pass with zero diagnostics and
  generate the Salesforce Marketing Cloud guide and API reference.
- Publish preparation and package packing pass. The tarball contains 103
  intended distribution, prepared documentation, README, license, and
  manifest files, with no source, tests, build configuration, or
  `node_modules`.
- A clean strict TypeScript consumer installed only the packed package and its
  declared dependencies, compiled a custom Hono environment, imported the
  constructor at runtime, and observed `/events`. A separate packed-package
  workerd consumer executed signed verification with `nodejs_compat`.
- Focused Biome, Prettier, whitespace, and credential-pattern checks pass. No
  test or build contacted Salesforce.

Corrections and deviations:

- The initial design inferred that the base64-looking callback
  `signatureKey` should be decoded. Salesforce's signing instructions decode
  only `x-sfmc-ens-signature` and use the callback key directly. The package,
  tests, example, recipe, and docs now treat `signatureKey` as opaque UTF-8
  HMAC key material.
- The initial design required `compositeId`, `mid`, `eid`, and `info` on every
  event. Official family documentation disproves that universal envelope:
  Automation Studio omits email tracking fields and OTT families can represent
  tenant ids differently. Only `eventCategoryType` and `timestampUTC` are
  universal package requirements; other fields remain validated optional
  projections over the complete `raw` provider object.
- `compositeId` is deprecated for transactional email and absent elsewhere, so
  the package does not expose a universal delivery or conversation key. The
  example composes a local identity only after validating the selected email
  families' tenant and composite object fields.
- Unsigned callback verification remains on the same provider-required
  `/events` endpoint but is fail-closed unless the application deliberately
  configures a setup handler. Flue returns the required empty `200`; the
  application still owns `/platform/v1/ens-verify`, OAuth, and callback
  lifecycle.
- Cloudflare validation uses Flue's canonical `nodejs_compat` configuration.
  The verification and Fetch-client paths happen to require only standard Web
  APIs, but avoiding supported Node APIs is not a compatibility requirement.

Foundation reflection:

- A provider batch fits the existing single-object handler contract cleanly as
  `{ c, batch }`. Provider order, one acknowledgment, and exact raw body remain
  local semantics; shared batching machinery would remove useful protocol
  distinctions without solving a concrete failure.
- An unsigned setup payload followed by signed traffic does not justify a
  shared setup abstraction. Notion and Salesforce have different challenge,
  lifecycle, authentication, and response semantics, while the existing fixed
  route and extensible callback contracts already express both.
- Provider acknowledgment ranges remain documentation and test concerns.
  Normal `Response` passthrough is the useful shared contract; a generic
  acknowledgment wrapper would duplicate Hono and obscure intentional
  redelivery responses.
- Fixed discovery, one-object callbacks, ordinary JSON and `Response`
  handling, project-owned clients and tools, and the actual `nodejs_compat`
  workerd gate all held. No shared runtime machinery change is justified.

Focused review:

- One independent review identified stale lockfile risk, fail-closed handling
  of unrecognized optional event-field shapes, non-canonical example identity
  serialization, and a guide/example event-list mismatch.
- The lockfile had already been regenerated before review completion and a
  frozen install passes. Optional fields now project only when they match the
  documented common type while remaining intact in `raw`; tests protect this
  future-family behavior. The example now serializes a fixed canonical
  reference and rejects non-canonical encodings, and the guide shows the same
  six grouped email cases as the executable module.
- No remaining concrete correctness, security, provider protocol, Hono,
  timeout, body handling, type-contract, Cloudflare, example-client,
  packaging, documentation, recipe, or durable test gap was identified.
- Residual risks are provider-owned or explicit: ENS provides no universal
  delivery id or signed timestamp, retries can repeat a whole batch for up to
  seven days, setup verification is intentionally unsigned, and
  already-started JavaScript work cannot be forcibly cancelled after timeout.

Research these one at a time. A provider being popular is not enough to relax
the HTTP, clean-room, or Cloudflare gates.

### Stripe implementation — 2026-06-13

Status:

- Complete.

Primary sources:

- Stripe webhook, signature, retry, event-destination, Connect, context,
  Checkout fulfillment, Billing webhook, and Issuing authorization docs.
- Official `stripe-node` v22.2.1 research plus the v22.2.0 package metadata,
  source, declarations, and
  Worker exports.
- Current Cloudflare Workers Fetch, Web Crypto, package-condition, and
  workerd-testing documentation.

Clean-room affirmation:

- The design and future fixtures derive from Stripe's primary specifications
  and original synthetic payloads. No third-party adapter implementation,
  types, fixtures, payloads, snapshots, or tests are being copied or
  translated.

Eligibility:

- Eligible for ordinary stateless HTTPS event destinations.
- The official Stripe SDK has explicit `workerd` exports, uses Fetch and Web
  Crypto there, and has no runtime dependencies. Actual workerd execution
  remains required before completion.
- EventBridge, Azure Event Grid, and long-lived transports are outside this
  package.

Design:

- Add `@flue/stripe`, `examples/stripe-channel`, `flue add stripe`, a setup
  guide, and an API reference.
- Publish one fixed `POST /webhook` route.
- Accept the project-owned Stripe SDK `client` because the provider SDK owns
  exact-byte verification, timestamp tolerance, payload-mode validation, and
  native event types.
- Default to snapshot events for the ordinary
  `createStripeChannel({ client, webhookSecret, webhook })` experience.
- Support explicit `eventPayload: 'thin'` for API v2 event notifications.
  Both modes preserve the callback shape `webhook({ c, event })`; their option
  types discriminate `Stripe.Event` from
  `Stripe.V2.Core.EventNotification`.
- Use `constructEventAsync()` and `parseEventNotificationAsync()` so the same
  path executes under Node and Web Crypto runtimes.
- Expose optional signature tolerance and body-limit controls. Do not invent a
  general Stripe handler deadline because Stripe documents no universal
  numeric deadline.
- Preserve normal channel response behavior: no value becomes empty `200`,
  JSON-compatible values become JSON, and ordinary Hono or Fetch responses
  pass through.
- Do not add conversation-key helpers. Stripe has stable event and resource
  identifiers but no universal conversation identity; applications choose a
  customer, subscription, account, checkout session, or other resource key
  appropriate to their workflow.
- Do not add configured account/context restrictions. A destination may
  intentionally aggregate Connect accounts or organization contexts, and the
  signing secret already authenticates the configured destination. Application
  code owns narrower routing policy.

Dependencies and example:

- `@flue/stripe` depends directly on Hono and peers on both `stripe` and
  `@types/node`; Stripe's public declarations reference the latter even on its
  Worker entry. It does not depend on `@flue/runtime`.
- The implementation and example pin aged `stripe@22.2.0` for reproducible
  workspace installs. The newer v22.2.1 patch was less than 24 hours old during
  implementation and changed generated API resources rather than the webhook,
  event-notification, Fetch, Web Crypto, or Worker-export paths used here, so
  the repository's `minimumReleaseAge` policy was preserved.
- The editable example constructs and exports the official Stripe client with
  `Stripe.createFetchHttpClient()`, dispatches completed Checkout events, and
  defines a narrow tool bound to the already-selected customer.
- Workerd tests must execute snapshot and thin verification plus a real
  outbound SDK request against fake Fetch with Flue's required
  `nodejs_compat` configuration.

Non-goals:

- Event-destination registration, secret rotation, OAuth, API-key storage,
  deduplication, ordering, replay recovery, and broad outbound tools.
- A universal schema combining snapshot and thin payloads.
- A generic guarantee for synchronous event workflows such as real-time
  Issuing authorization. Applications may return provider responses through
  the normal handler API, but the package and example do not claim that
  specialized latency-sensitive workflow.

Foundation reflection to revisit after implementation:

- Whether accepting a provider SDK for verified ingress remains a clean
  exception to otherwise SDK-free channel packages.
- Whether snapshot and thin modes expose any weakness in the shared callback,
  response, package, example, or workerd conventions.

Implementation:

- Added `@flue/stripe` with one fixed `POST /webhook` route, default snapshot
  events, explicit thin event notifications, exact-byte official SDK
  verification, configurable signature tolerance and body limit, and the
  established Hono-compatible result contract.
- Added original Node and workerd protocol suites. They cover valid and
  tampered bytes, missing, malformed, rotated, and stale signatures, malformed
  JSON and event envelopes, payload-mode mismatches, media type, declared and
  streamed body limits, future snapshot event types, thin notifications with
  and without related objects, handler results, failures, constructor
  validation, and route publication.
- Added `examples/stripe-channel` with a project-owned official Fetch client,
  grouped Checkout completion cases, customer-scoped dispatch, a narrow
  customer-summary tool, trusted Connect or organization context binding,
  Node fake-Fetch coverage, and workerd fake-Fetch coverage.
- Added `flue add stripe`, the Stripe connector recipe, setup and API docs,
  navigation and channel overview entries, README, changelog, and publish
  wiring.

Validation:

- Package build, strict typecheck, 13 Node tests, and two workerd ingress tests
  pass. Workerd executes the official Stripe Worker export, Web Crypto snapshot
  and thin verification, context parsing, and SDK-provided fetch methods under
  Flue's required `nodejs_compat` configuration.
- Example strict typecheck, Node fake-client test, workerd fake-client test,
  Node build, and Cloudflare target build pass. The workerd test executes a
  real official SDK customer request against fake Fetch and confirms the Node
  HTTP client is unavailable in that runtime.
- A built Node application returned an empty `200` for an original locally
  signed event and `400` for the same exact payload with an invalid signature.
- The focused CLI suite passes, and the real built CLI returned the Stripe
  recipe through the locally built connector registry.
- Documentation typecheck and production build pass; the connector site build
  serves `/cli/connectors/stripe.md`.
- Publish preparation and package packing pass. The tarball contains only the
  intended distribution files, prepared docs, README, license, and manifest.
- A clean strict TypeScript consumer installed only the packed
  `@flue/stripe` package and `stripe`, compiled snapshot and thin handlers with
  a custom Hono environment, and imported the constructor at runtime.
- Credential-pattern and whitespace checks found no leaked provider secret or
  authentication logging. No verification contacted Stripe.

Corrections and deviations:

- Official Stripe declarations showed that valid thin notification families
  can omit `related_object`. The initial runtime guard rejected those
  deliveries, so it now accepts the absent field and coverage protects the
  provider-native behavior.
- The first packed-consumer check exposed that Stripe's Worker declarations
  still reference `@types/node` while Stripe declares that peer optional.
  `@flue/stripe` now declares it as a required peer, and the recipe explains
  the fallback for package managers that do not install peers automatically.
  Keeping it as a peer preserves one consumer-owned Stripe type graph and adds
  no Node runtime code to the Worker bundle.
- One early parallel command raced the example typecheck against a package
  build while `tsdown` replaced `dist`. Ordered package-then-example checks
  pass; this was verification ordering rather than an implementation defect.
- Workerd reports missing upstream Stripe source-map files, and Cloudflare
  builds repeat the existing example Durable Object migration warning. Both
  are non-failing upstream or repository-wide warnings, not Stripe channel
  runtime failures.

Foundation reflection:

- Accepting the provider SDK is a justified local exception: Stripe's official
  implementation owns signature compatibility, Web Crypto selection, native
  event construction, thin context parsing, and fetch helpers, and it executes
  in both required runtimes.
- Snapshot and thin payload modes fit the existing single-object callback,
  fixed-route discovery, and response contract without shared channel changes.
  Their differences remain explicit in one provider-specific discriminated
  constructor option.
- The only repeated machinery was ordinary body limiting and result
  serialization. No new failure scenario justifies extracting another shared
  channel runtime abstraction.
- No Stripe capability is deferred within ordinary stateless HTTPS event
  destinations. EventBridge, Azure Event Grid, registration, secret lifecycle,
  synchronous Issuing policy, deduplication, and outbound API breadth remain
  intentionally outside this channel.

Focused review:

- Independent review found the duplicate Stripe type graph caused by making
  `@types/node` a direct dependency. The final design uses a required
  compatible peer plus repository-only dev pins, and both the example and
  clean packed consumer now resolve one Stripe type instance.
- Review also confirmed that Stripe's generated snapshot and thin unions are
  closed even though the SDK forwards future verified event types. Widening
  the callback would destroy native known-event payload narrowing, so the API,
  guide, recipe, and README document the explicit `event.type as string`
  fallback until the project upgrades Stripe.
- Review found that Stripe rejects requests containing both `stripeAccount`
  and `stripeContext`. The example now prefers the richer verified context and
  falls back to the Connect account only when no context is present. Review
  also found that the initial `@types/node` peer range rejected newer
  compatible declarations; it now matches Stripe's `>=18` compatibility while
  retaining the repository's pinned development version.
- The built Node route has a valid and invalid signed smoke test. Workerd
  separately executes the same Hono ingress route and official verifier, and
  the complete example Worker artifact builds. A second provider assertion
  layer over generated Worker output would duplicate package protocol coverage
  without protecting a distinct contract.
- No unresolved correctness, security, packaging, Cloudflare, or developer
  experience findings remain.

### Notion implementation — 2026-06-13

Status:

- Complete.

Primary sources:

- Notion webhook overview, endpoint verification, event delivery, signature,
  event-type, and API-version documentation.
- Official `@notionhq/client` v5.22.0 package declarations, runtime artifact,
  README, release history, and Cloudflare compatibility fixes.
- Current Cloudflare Workers Fetch, Web Crypto, and workerd-testing
  documentation.

Clean-room affirmation:

- The design and future fixtures derive from Notion's primary specifications
  and original synthetic payloads. No third-party adapter implementation,
  types, fixtures, payloads, snapshots, or tests are being copied or
  translated.

Eligibility:

- Eligible for stateless HTTPS webhook subscriptions. Notion delivers a
  one-time unsigned `verification_token` request, then signs subsequent exact
  request bodies with HMAC-SHA256 in `X-Notion-Signature`.
- Events expose a unique delivery id, attempt number, workspace, subscription,
  integration, authors, resource identity, and API version. Notion retries
  failed deliveries up to eight times with exponential backoff and does not
  guarantee ordering.
- Notion documents no signed timestamp or replay window. The package can
  authenticate exact bytes and expose delivery identity, but application-owned
  deduplication is the only replay defense.
- The official client is Fetch-injectable and documents Cloudflare Workers
  compatibility after its v5.21 runtime fix. Actual SDK execution in workerd
  with Flue's required `nodejs_compat` configuration remains required before
  completion.
- Webhook subscription creation, OAuth, integration ownership, token storage,
  and event selection remain developer-owned setup.

Design:

- Add `@flue/notion`, `examples/notion-channel`, `flue add notion`, a setup
  guide, and an API reference.
- Publish one fixed `POST /webhook` route.
- Accept an optional `verificationToken` during the endpoint-verification
  phase and an optional `verification({ c, verificationToken })` callback.
  At least a configured token or a verification callback is required. The
  callback is explicitly unauthenticated because Notion supplies the token
  before a signing secret exists; it lets trusted application code capture the
  token without making installation lifecycle part of Flue.
- A verification request receives the normal handler-result contract, or an
  empty `200` for a matching configured token. Once a token is configured, it
  takes precedence over and blocks the temporary setup callback. Ordinary
  events require a configured verification token; an endpoint still awaiting
  configuration returns `503` so Notion can retry rather than invoking
  application code without authentication.
- Verify `X-Notion-Signature` against the exact body with Web Crypto before
  parsing or invoking the event callback. Support optional fixed
  `workspaceId`, `subscriptionId`, and `integrationId` checks with `403` on a
  signed mismatch.
- Type known events from the official SDK's exported webhook payload types,
  widened only where current primary docs allow author type `agent`. Preserve
  future verified event visibility through an explicit unknown-event wrapper
  rather than weakening known-event switch narrowing.
- Preserve the callback shape `webhook({ c, event })` and established response
  behavior: no value becomes empty `200`, JSON-compatible values become JSON,
  and ordinary Hono or Fetch responses pass through.
- Do not invent a handler deadline because Notion documents retries but no
  universal numeric response deadline.
- Do not expose a package-level conversation key. Notion has unrelated page,
  comment, database, data-source, view, and file identities, so applications
  choose the resource identity appropriate to each workflow.

Dependencies and example:

- `@flue/notion` depends directly on Hono and peers on
  `@notionhq/client` and `@types/node`; the packed strict consumer proved that
  the official declarations require Node types even though the runtime path is
  Fetch-only. The package does not depend on `@flue/runtime` and does not use
  the SDK client for ingress.
- The editable example exports the official Notion client with injected Fetch,
  groups useful page event cases, dispatches by an explicitly local page-based
  instance id, and defines a narrow page-retrieval tool bound to that
  already-selected page.
- Keep the verification callback visible but commented out in the example and
  recipe. Explain that it is temporary setup code and that the received token
  must be stored as `NOTION_WEBHOOK_VERIFICATION_TOKEN` before ordinary event
  delivery.
- Workerd tests must execute Web Crypto ingress verification and a real
  official SDK page request against fake Fetch with Flue's required
  `nodejs_compat` configuration.

Non-goals:

- Webhook subscription creation, event-selection policy, public-integration
  approval, OAuth, token rotation, installation persistence, deduplication,
  ordering, replay recovery, and broad outbound tools.
- Fetching full page or database state during ingress. Notion intentionally
  sends lightweight changed-resource notifications; the application decides
  when its project-owned client should retrieve current state.
- Treating workspace, subscription, integration, page, or delivery ids as
  authorization capabilities.

Foundation reflection to revisit after implementation:

- Whether the one-time unauthenticated verification callback fits the existing
  optional-surface conventions without shared routing changes.
- Whether peer-typing against a Fetch-compatible but CommonJS provider SDK
  exposes a repeated packed-consumer or Workers issue after Stripe.
- Whether page conversation identity is useful enough to keep provider-local
  without implying that every resource webhook has a conversation.

Implementation:

- Added `@flue/notion` with one fixed `POST /webhook` route, explicit unsigned
  setup-token handling, exact-byte HMAC-SHA256 verification, optional fixed
  workspace/subscription/integration checks, body limiting, SDK-derived known
  event types, future event/API-version fallback, and the established
  Hono-compatible response contract.
- Added original Node and workerd protocol suites. They cover exact bytes,
  missing, malformed, and incorrect signatures, unsigned setup capture,
  configured-token precedence, unconfigured signed delivery, fixed identity,
  content type, malformed and streamed lengths, body limits, malformed known
  payloads, optional principals, future events and API versions, representative
  comment/page/database/data-source/file/view families, handler results,
  failures, constructor validation, and route publication.
- Added `examples/notion-channel` with the official client, one shared
  Fetch-adapting client factory, grouped page events, a local page-based agent
  instance id, a page-bound retrieval tool, temporary setup guidance, and Node
  and workerd fake-Fetch tests.
- Added `flue add notion`, the Notion connector recipe, setup and API docs,
  navigation and channel overview entries, README, changelog, and publish
  wiring.

Validation:

- Package build, strict typecheck, 17 Node tests, and two workerd ingress tests
  pass. Workerd executes exact-byte Web Crypto verification and setup handling
  with Flue's required `nodejs_compat` configuration.
- Example strict typecheck, Node fake-client test, workerd fake-client test,
  Node build, and Cloudflare target build pass. Both runtime tests execute the
  same exported `createNotionClient()` factory used to create the project-owned
  client and fail unexpected network destinations.
- A built Node application returned an empty `200` for an original locally
  signed future event and `401` for the same signature over altered bytes.
- The focused CLI suite passes, and the built CLI returns the Notion recipe
  through the locally built connector registry.
- Documentation typecheck and production build pass. The connector site build
  serves `/cli/connectors/notion.md`.
- Publish preparation and package packing pass. The tarball contains only the
  intended distribution files, prepared docs, README, license, and manifest.
- A clean strict TypeScript consumer installed only the packed
  `@flue/notion` package and `@notionhq/client`; required peers resolved,
  custom Hono environment types compiled, and the constructor imported at
  runtime.
- Credential-pattern, formatting, and whitespace checks found no logged or
  embedded real secret. No verification or client test contacted Notion.

Corrections and deviations:

- The published `@notionhq/client@5.22.0` contains webhook payload types but
  not the Web Crypto verification helpers added to the official repository
  shortly after that release. The channel implements the documented
  HMAC-SHA256 operation directly instead of depending on unreleased source.
- The package does not expose the initially proposed page conversation helper.
  Notion has no universal conversation across its unrelated resource families;
  the example instead labels its page-based instance id as an application
  convention.
- The configured signing token now takes precedence over the temporary setup
  callback. Accidentally leaving setup code present cannot route arbitrary
  unsigned values into application secret storage after configuration.
- The official SDK's published declarations omit documented `agent`
  principals and import `node:http`. The package widens `authors` and
  `accessible_by` to the documented principal set and declares
  `@types/node >=18` as a required peer. This adds no Node runtime code.
- The first clean consumer proved that projects constraining
  `compilerOptions.types` must include `"node"`; the recipe, guide, README,
  and example configuration now state that requirement.
- One parallel verification command raced an example Node build against a CLI
  rebuild that temporarily removed `dist/flue.js`. Ordered runtime, CLI, and
  example checks pass; this was verification ordering rather than a source
  defect.

Foundation reflection:

- Notion's setup handshake fits one fixed route without shared routing changes.
  Its unauthenticated callback remains provider-specific, and configured-token
  precedence supplies the safety invariant needed to keep it local.
- Known event validation must justify SDK-derived callback types. Notion's
  larger provider union required family-level structural checks and explicit
  future-version fallback; no generic cross-provider validator would reduce
  that provider-specific work safely.
- The repeated `@types/node` declaration friction seen with Stripe is caused by
  provider SDK type graphs, not Flue runtime code. Compatible required peers
  plus clean packed-consumer checks remain the least surprising solution.
- Fixed discovery, the single-object callback, normal response handling,
  example client ownership, and Node/workerd conventions all held. No shared
  channel machinery change is justified.

Focused review:

- Independent review found that the first known-event guard retained optional
  SDK fields such as `accessible_by` without validating them. The final
  implementation validates every retained base field and each supported
  resource-family payload before exposing SDK-derived types; malformed
  principals and family data receive `400`.
- Review found that the first example tests created separate SDK clients.
  Production and tests now share the exported `createNotionClient()` factory,
  so Node and workerd cover the actual Fetch adapter used by `client`.
- Review found stale roadmap claims about a canonical page key and setup-token
  precedence. The design and implementation log now match the shipped local
  page convention and configured-token behavior.
- No unresolved correctness, security, packaging, Cloudflare, or developer
  experience findings remain.

### Resend implementation — 2026-06-13

Status:

- Complete.

Primary sources:

- Resend webhook management, signature verification, retry/replay,
  `email.received`, inbound email, content retrieval, attachment, and reply
  documentation.
- Official `resend` v6.12.4 package metadata, declarations, runtime artifact,
  and Standard Webhooks dependency.
- Standard Webhooks verification specification and the official JavaScript
  implementation used by Resend.
- Current Cloudflare Workers Fetch and workerd-testing documentation.

Clean-room affirmation:

- The design and fixtures derive from Resend's primary specifications and
  original synthetic payloads. No third-party adapter implementation, types,
  fixtures, payloads, snapshots, or tests are being copied or translated.

Eligibility:

- Eligible in principle for stateless HTTPS webhooks. Resend signs the exact
  request body plus `svix-id` and `svix-timestamp`, applies a five-minute
  timestamp tolerance through its official verifier, and delivers at least
  once with exponential retries and manual replay.
- The `svix-id` header is the stable delivery identifier for
  application-owned deduplication. Ordering is not guaranteed.
- `email.received` contains address, message, subject, and attachment metadata,
  but intentionally omits bodies, complete headers, and attachment content.
  Applications retrieve those later through the project-owned Resend client.
- The official SDK uses global Fetch for ordinary API calls and pure
  JavaScript Standard Webhooks verification. Its package is named and
  engine-constrained for Node, so actual verifier and client execution in
  workerd with Flue's required `nodejs_compat` configuration is a completion
  gate rather than an inferred compatibility claim.

Design:

- Add `@flue/resend`, `examples/resend-channel`, `flue add resend`, a setup
  guide, and an API reference.
- Publish one fixed `POST /webhook` route.
- Accept the project-owned official Resend `client` and `webhookSecret`.
  Verification uses `client.webhooks.verify()` over the exact raw string and
  original `svix-*` headers before application code runs.
- Deliver the explicitly supported SDK event variants as their provider-native
  typed payloads. Validate every retained field before exposing those types and
  preserve other verified event types through an explicit unknown-event
  wrapper.
- Pass header-derived delivery metadata alongside the event in the extensible
  callback object. Preserve the unique delivery id and signed timestamp
  without claiming built-in deduplication.
- Preserve the established response contract: no value becomes empty `200`,
  JSON-compatible values become JSON, and ordinary Hono or Fetch responses
  pass through. Resend documents no universal numeric response deadline, so
  the package will not invent one.
- Expose a configurable body limit and require JSON media type. Invalid,
  missing, stale, or malformed authentication receives `400`; oversized
  requests receive `413`; unsupported media receives `415`.
- Do not add a package-level conversation helper. `message_id` identifies one
  received message and supports `In-Reply-To`, but later messages in the same
  email thread have different message ids and root-thread reconstruction
  requires headers that are not present in the webhook.

Dependencies and example:

- `@flue/resend` depends directly on Hono and peers on `resend`. A required
  `@types/node` peer is expected because the official SDK's public attachment
  declarations expose `Buffer`; the clean packed-consumer check will confirm
  the final requirement.
- The editable example exports the official client, handles
  `email.received`, dispatches using an explicitly local message-based agent
  instance id, and defines a narrow tool that retrieves the already-bound
  received email. Outbound sending and reply policy remain application-owned.
- Node and workerd tests will execute the same exported client factory against
  a fake Fetch destination and fail any unexpected network access.

Non-goals:

- Receiving-domain setup, MX records, webhook registration, secret rotation,
  API-key storage, deduplication, ordering, replay persistence, attachment
  storage, outbound composition, and reply authorization.
- Treating a Resend message id, email id, recipient, webhook delivery id, or
  signing secret as an authorization capability.
- Polling through the Resend CLI or adding a general inbound-email abstraction
  shared with unrelated providers.

Foundation reflection to revisit after implementation:

- Whether a second official SDK-owned verifier strengthens the existing
  provider-local exception established by Stripe without requiring shared
  channel machinery.
- Whether delivery metadata belongs cleanly beside `event` in the callback
  object and whether any existing provider would gain a concrete correctness
  benefit from the same shape.
- Whether a Fetch-based SDK whose declarations and package metadata remain
  Node-oriented exposes a new example, peer-type, or workerd-validation
  requirement beyond the Stripe and Notion precedents.

Implementation:

- Added `@flue/resend` with one fixed `POST /webhook` route, official SDK
  verification over exact UTF-8 request bytes, signed delivery metadata,
  provider-native known event variants, verified unknown-event normalization,
  body limiting, structural event validation, and the established
  Hono-compatible result contract.
- Added original Node and workerd protocol suites. They cover exact bytes,
  missing, malformed, incorrect, stale, and future authentication, known email,
  contact, and domain families, malformed known payloads, future event types,
  media type, invalid UTF-8, declared and streamed body limits, delivery
  identity, handler results, constructor validation, and route publication.
- Added `examples/resend-channel` with the official client, a shared client
  factory, `email.received` dispatch, an explicitly local message-based agent
  instance id, a narrow received-email retrieval tool, and Node and workerd
  fake-Fetch tests.
- Added `flue add resend`, the Resend connector recipe, setup and API docs,
  navigation and channel overview entries, README, changelog, and publish
  wiring.

Validation:

- Package build, strict typecheck, nine Node tests, and two workerd ingress
  tests pass. The final audit executes the official Resend verifier over exact
  bytes in workerd with Flue's required `nodejs_compat` configuration and
  confirms `process` and `Buffer` are available.
- Example strict typecheck, Node fake-client test, workerd fake-client test,
  Node build, and Cloudflare target build pass. The workerd client test
  executes `emails.receiving.get()` through the official SDK in the canonical
  `nodejs_compat` environment.
- A separate clean workerd consumer installed only the packed
  `@flue/resend`, `resend`, declaration peers, and the Workers test runner. It
  executed both verification and the receiving-email Fetch path under
  `nodejs_compat` without React runtime packages.
- A built Node application returned an empty `200` for an original locally
  signed future event and `400` for the same signature over altered bytes.
- The full CLI suite passes: 53 Node tests and 24 Vitest tests. The real built
  CLI returns the Resend recipe through the locally built connector website.
- Documentation check and production build pass. The connector website build
  serves `/cli/connectors/resend.md`.
- Publish preparation and package packing pass. The tarball contains 95
  intended distribution, documentation, README, license, and manifest files.
- A clean strict TypeScript consumer installed only the packed package,
  `resend`, and the required declaration peers; custom Hono environment types
  compiled and the constructor imported at runtime.
- Formatting, whitespace, and local credential-pattern review found no real
  provider secret or authentication logging. No test or build contacted
  Resend.

Corrections and deviations:

- The official SDK's public declarations import React types and expose
  `Buffer`, despite the verified Fetch and Standard Webhooks runtime paths
  requiring neither React nor Node. `@flue/resend` therefore declares
  compatible `@types/react` and `@types/node` peers, and the recipe explains
  that both are declaration-only requirements.
- The package pins its known event-name union rather than aliasing the SDK's
  entire evolving `WebhookEventPayload`. This prevents a compatible future SDK
  minor from advertising a newly added event as provider-native before this
  package validates its payload; other verified event types remain observable
  through the unknown wrapper.
- Resend's official Cloudflare documentation supports the SDK, but some
  helpers are not uniformly edge-safe. In particular, wrapped inbound
  forwarding can use `Buffer`. The example intentionally demonstrates only the
  receiving-email retrieval path proven in workerd and does not make a blanket
  claim about every SDK method.
- The first direct `flue add resend --print` check used the deployed registry
  and correctly could not see unreleased repository content. The final check
  points the built CLI at the locally built connector website through
  `FLUE_REGISTRY_URL`, matching the pre-release integration contract.

Foundation reflection:

- Resend reinforces that accepting a project-owned provider SDK for verified
  ingress is a provider-local exception justified when the official verifier
  owns timestamp tolerance, signature rotation syntax, and native event types
  and actually executes in both required runtimes. No shared verifier
  abstraction is warranted.
- Delivery metadata fits naturally beside `event` in the extensible callback
  object. Existing channels already expose equivalent provider metadata either
  on normalized events or delivery objects; no concrete failure requires
  changing their public shapes.
- The repeated SDK declaration friction from Stripe, Notion, and Resend is
  best caught by packed strict-consumer checks. The exact peer set remains
  provider-specific, so a shared runtime or package abstraction would not
  improve correctness.
- Fixed discovery, Hono context typing, response handling, project-owned
  clients and tools, and Node/workerd validation all held. No shared channel
  machinery change is justified.

Focused review:

- Independent review found that the standard `Response` passthrough contract
  could let an application return `202` or `204` without realizing Resend
  retries every status other than `200`. The package intentionally preserves
  the normal Hono response API so applications can request redelivery. Source
  JSDoc, the test name, README, guide, API reference, and connector recipe now
  state that only `200` acknowledges delivery and non-`200` responses
  intentionally trigger retry.
- No unresolved correctness, security, packaging, Cloudflare, or developer
  experience findings remain.

### Shopify implementation — 2026-06-13

Status:

- Complete.

Primary sources:

- Shopify HTTPS webhook delivery, verification, subscription, filtering,
  versioning, topic-reference, GraphQL Admin API, and privacy-compliance
  documentation.
- Official `@shopify/shopify-api` v13.0.0 and
  `@shopify/admin-api-client` v1.1.2 package metadata, declarations, runtime
  artifacts, and official source.
- Current Cloudflare Workers Web Crypto and workerd-testing documentation.

Clean-room affirmation:

- The design and fixtures derive from Shopify's primary specifications and
  original synthetic payloads. No third-party adapter implementation, types,
  fixtures, payloads, snapshots, or tests are being copied or translated.

Eligibility:

- Eligible for stateless JSON HTTPS webhook delivery. Shopify computes a
  base64 HMAC-SHA256 over the exact request body, requires no ingress-side
  installation session, and delivers topic, shop, API-version, delivery, and
  optional causal metadata in request headers.
- Shopify permits XML subscriptions, but the first-party Flue channel is
  intentionally JSON-only. Connector guidance must configure `JSON`, and an
  XML delivery receives `415`.
- Shopify documents a one-second connection timeout, five-second total
  response deadline, eight retries over four hours, possible duplicate and
  out-of-order delivery, and no signed timestamp or replay window.
  Application-owned deduplication should use the webhook delivery id.
- App Store apps must receive `customers/data_request`, `customers/redact`,
  and `shop/redact`; those topics use the same verified route. Installation
  and token state must remain outside ingress because `shop/redact` can arrive
  after uninstall.
- Direct Web Crypto verification and the official lightweight Admin GraphQL
  client both execute in workerd with Flue's required `nodejs_compat`
  configuration. The full `@shopify/shopify-api` package also has a Worker
  adapter, but it is
  Node-oriented, substantially broader, and unnecessary for either ingress or
  the editable example.

Design:

- Add `@flue/shopify`, `examples/shopify-channel`, `flue add shopify`, a setup
  guide, and an API reference.
- Publish one fixed `POST /webhook` route.
- Accept `clientSecret` plus optional `previousClientSecret` so deployments
  can overlap Shopify's documented secret-rotation propagation period.
- Verify the exact raw bytes with Web Crypto before decoding or parsing.
  Require the documented HMAC, topic, shop-domain, API-version, and webhook-id
  headers; expose optional event-id, triggered-at, subscription-name, and
  sub-topic metadata.
- Deliver one typed `ShopifyWebhookEvent` containing provider-native topic and
  delivery metadata, losslessly parsed JSON payload, and exact raw body. Keep
  the payload JSON-typed rather than publishing a false closed union: its
  schema changes by topic and API version, and subscription `includeFields`
  filtering can intentionally remove normal resource fields. Represent unsafe
  numeric literals as strings so Shopify's 64-bit ids are never silently
  rounded by JavaScript.
- Preserve every verified topic, including future topics. Do not return `404`
  for an event merely because Flue has no topic-specific model.
- Expose `handlerTimeoutMs`, defaulting to and capped at 4500ms across body
  receipt, verification, parsing, and the application callback to leave time
  before Shopify's five-second deadline. Route failure or timeout returns
  `500`; timed-out work can continue because JavaScript promises are not
  cancellable.
- Preserve normal result behavior: no value becomes empty `200`,
  JSON-compatible values become JSON, and ordinary Hono or Fetch responses
  pass through. Document that non-2xx responses request retry.
- Use `shopDomain` as tenant metadata, `webhookId` as delivery identity, and
  `eventId` only as optional causal correlation. Do not add a conversation
  helper or universal resource key.
- Document that Shopify's HMAC covers the body rather than the delivery
  headers. Header metadata is provider-supplied routing context, not an
  authorization capability or independent cryptographic claim.

Dependencies and example:

- `@flue/shopify` depends on Hono and the standards-based `lossless-json`
  parser, and uses Web Crypto. It does not depend on the Shopify SDK or
  `@flue/runtime`.
- The editable example exports an
  `@shopify/admin-api-client@1.1.2` GraphQL client with an injected Fetch
  implementation, handles `orders/create`, dispatches through an explicitly
  local shop-and-order instance id, and defines a narrow tool bound to that
  selected order.
- Trusted application code binds the shop domain, Admin API version, and
  access token. The tool must not let model input select an arbitrary shop,
  token, or URL.
- Node and workerd tests execute the same exported client factory against
  fail-closed fake Fetch. The expected declaration-only `Buffer` reference in
  `@shopify/graphql-client` must be resolved through the packed strict-consumer
  check without adding Node runtime code.

Non-goals:

- App installation, OAuth, token lookup, webhook registration, subscription
  filters, secret rotation orchestration, deduplication, ordering, replay
  persistence, compliance-business workflows, and broad outbound Admin API
  tools.
- XML webhook delivery, EventBridge, Google Pub/Sub, Shopify Events beta
  surfaces, polling, or long-lived transports.
- A universal Shopify topic payload schema or a claim that header metadata is
  signed independently of the body.

Foundation reflection to revisit after implementation:

- Whether a provider with a deliberately JSON-typed payload still satisfies
  the channel event contract more honestly than a partial topic union.
- Whether the fourth provider-specific SDK declaration issue justifies any
  shared packaging guidance beyond the existing packed-consumer gate.
- Whether the five-second delivery limit exposes any shared timeout behavior
  that should be reconciled across other fixed webhook channels.

Implementation:

- Added `@flue/shopify` with one fixed `POST /webhook` route, exact-byte
  Web Crypto HMAC verification, current and previous secret overlap, required
  and optional delivery metadata, lossless JSON parsing, body limiting, a
  complete-route deadline, future-topic delivery, and the established
  Hono-compatible result contract.
- Added original Node and workerd protocol suites. They cover exact bytes,
  current and previous secrets, missing, malformed, and incorrect
  authentication, required and optional metadata, compliance and future
  topics, unsafe 64-bit numeric ids, UTF-8 and JSON failures, media type,
  declared and streamed body limits, handler results, complete-route timeout,
  constructor validation, and route publication.
- Added `examples/shopify-channel` with the official lightweight Admin
  GraphQL client, a shared injected-Fetch factory, `orders/create` dispatch, an
  explicitly local shop-and-order instance id, a shop-bound order retrieval
  tool, and Node and workerd fail-closed client tests.
- Added `flue add shopify`, the Shopify connector recipe, setup and API docs,
  navigation and channel overview entries, README, changelog, and publish
  wiring.

Validation:

- Package build, strict typecheck, ten Node tests, and three workerd ingress
  tests pass. Workerd executes Web Crypto verification, current and rotated
  secrets, lossless unsafe-id parsing, and streamed body limiting with
  `nodejs_compat`; `process` and `Buffer` are present.
- Example strict typecheck, Node fake-client test, workerd fake-client test,
  Node build, and Cloudflare target build pass. Both runtime tests execute the
  same exported `createShopifyClient()` factory and reject unexpected network
  destinations. The client workerd test runs with Flue's required
  `nodejs_compat` configuration.
- The generated Flue Worker includes `nodejs_compat` because the current Flue
  runtime requires it for API-key lookup and AsyncLocalStorage. The final audit
  treats this as the canonical provider proof and executes both package
  verification and the official Admin client in that environment.
- A built Node application returned an empty `200` for an original locally
  signed future-topic body and `401` when one value changed under the same
  signature.
- The full CLI suite passes: 54 Node tests and 24 Vitest tests. The built CLI
  returned the Shopify recipe through the locally built connector website.
- Documentation check and production build pass, and the connector website
  build serves `/cli/connectors/shopify.md`.
- Publish preparation and package packing pass. The tarball contains only the
  intended distribution, prepared documentation, README, license, and
  manifest files.
- A clean strict TypeScript consumer installed only the packed
  `@flue/shopify` package and TypeScript, resolved Hono and `lossless-json`,
  compiled a custom Hono environment, and imported the constructor at
  runtime.
- A separate clean workerd consumer installed the packed package and executed
  exact-byte verification plus unsafe-id parsing under `nodejs_compat`.
- Focused Biome, Prettier, whitespace, and credential-pattern checks pass.
  The repository-wide lint command still reports unrelated existing warnings
  in runtime, Postgres, Notion, and CLI files. No Shopify test or build
  contacted Shopify.

Corrections and deviations:

- Ordinary `JSON.parse()` silently rounds Shopify's valid 64-bit numeric ids.
  The package therefore adds the small, standards-based `lossless-json`
  runtime dependency. Safe numeric literals remain numbers; unsafe literals
  become exact decimal strings. The example validates `string | number` ids
  and normalizes them to strings before constructing GraphQL GIDs.
- The initial 4500ms timer covered only the application callback. Independent
  review demonstrated that a slow request body plus a near-limit callback
  could return `200` after Shopify's five-second total deadline. The final
  timeout covers body receipt, verification, parsing, and callback execution;
  cumulative-duration coverage protects that behavior.
- The package does not accept the full Shopify SDK for ingress. Direct Web
  Crypto implements the documented verification operation without a
  Node-oriented package, adapter initialization, global runtime state, topic
  normalization, or unrelated installation APIs.
- The example uses `@shopify/admin-api-client@1.1.2`, not the full SDK or the
  legacy REST client. Its public dependency graph has a declaration-only
  `Buffer` reference, so the example carries `@types/node` as a development
  dependency while the channel package and runtime remain free of Node types
  and code.

Foundation reflection:

- A JSON-typed provider payload is the honest contract for Shopify. Topic
  payloads vary by API version and subscription field selection, and a partial
  typed union would either reject valid filtered deliveries or overstate what
  Flue validated. Provider-native topic and delivery metadata still give the
  callback a useful typed surface.
- Shopify is the first provider to require lossless generic JSON parsing.
  The problem and dependency are provider-specific; no existing channel gains
  correctness from changing its parser, so no shared abstraction is
  justified.
- The complete-route deadline is a concrete Shopify requirement because the
  provider documents five seconds for the entire delivery. Other packages
  should not be changed merely for consistency; their documented provider
  deadline and current timer semantics must be reviewed independently before
  any cross-channel change.
- Provider SDK declaration friction remains best caught through each
  example's strict typecheck and packed-consumer gate. The Shopify channel
  package itself avoids the issue by keeping its outbound client
  project-owned.
- Fixed discovery, the single-object callback, normal response handling,
  project-owned clients and tools, and Node/workerd validation all held. No
  shared routing or response machinery change is justified.

Focused review:

- Independent review found the complete-route deadline defect described
  above. The implementation, public JSDoc, API reference, guide, connector,
  README, and roadmap now consistently define `handlerTimeoutMs` across body
  receipt, verification, parsing, and callback execution.
- Review requested stronger workerd evidence for unsafe numeric parsing and
  streamed limits. Both now execute in the package's workerd suite.
- No unresolved correctness, security, packaging, Cloudflare, or developer
  experience findings remain.

### Intercom implementation — 2026-06-13

Status:

- Complete.

Primary sources:

- Intercom webhook overview, endpoint setup, notification delivery, v2.15
  topic, signature, conversation, ticket, authentication, and REST API
  documentation.
- Official `intercom-client` v7.0.3 package metadata, declarations, and
  runtime artifacts.
- Current Cloudflare Workers Node.js compatibility, Web Crypto, and
  workerd-testing documentation.

Clean-room affirmation:

- The design and future fixtures derive from Intercom's primary
  specifications and original synthetic payloads. No third-party adapter
  implementation, types, fixtures, payloads, snapshots, or tests are being
  copied or translated.

Eligibility:

- Eligible for ordinary stateless HTTPS webhook delivery. Intercom validates
  the configured URL with an unsigned `HEAD`, then sends one signed JSON
  notification per `POST`.
- Intercom signs the exact request body with HMAC-SHA1 and the developer app
  client secret in `X-Hub-Signature`. It supplies no signed timestamp or
  replay window.
- Intercom documents a five-second response deadline, higher priority for
  responses within 500ms, unordered and duplicate delivery, one retry after
  one minute for ordinary failures, subscription disabling on `410`, and
  throttling on `429`.
- Official documentation conflicts between accepting any `2xx` and requiring
  exactly `200` to avoid redelivery. The normal no-value and JSON channel
  results produce `200`; documentation will warn that custom success statuses
  may not acknowledge reliably.
- The official SDK is Fetch-injectable and dependency-free. Its limited Node
  global usage is acceptable under Flue's required `nodejs_compat`; actual SDK
  execution in workerd remains required before completion.

Design:

- Add `@flue/intercom`, `examples/intercom-channel`,
  `flue add intercom`, a setup guide, and an API reference.
- Publish fixed `HEAD /webhook` and `POST /webhook` routes. `HEAD` returns an
  empty `200` for Intercom's endpoint check and does not invoke application
  code.
- Accept `clientSecret`, optional `workspaceId`, `bodyLimit`, and
  `handlerTimeoutMs`.
- Verify exact raw bytes with Web Crypto before UTF-8 decoding or parsing.
  Require `application/json` and the documented `sha1=<hex>` signature.
- Deliver a typed `IntercomWebhookEvent` with the provider topic, workspace
  id from `app_id`, nullable notification id, timestamps, attempt count,
  provider-native JSON item, optional self URL, and complete parsed envelope.
- Preserve every verified topic, including `ping` and future topics. Payload
  schemas are deliberately JSON-typed because the catalog is broad,
  API-versioned, deletion topics are intentionally minimal, and several
  topics have exceptional wrappers.
- Expose canonical workspace-scoped conversation identity helpers. Intercom
  explicitly warns that resource ids are not globally unique. Do not infer a
  conversation from every event; the application supplies a verified
  conversation id from the topic payload it handles.
- Apply a complete-route deadline defaulting to and capped at 4500ms across
  body receipt, verification, parsing, and the application callback.
- Preserve the established result contract: no value becomes empty `200`,
  JSON-compatible values become JSON, and ordinary Hono or Fetch responses
  pass through.

Dependencies and example:

- `@flue/intercom` depends only on Hono and Web Crypto. It does not depend on
  the provider SDK or `@flue/runtime`.
- The editable example exports the official `intercom-client`, handles
  contact-initiated and contact-replied conversation topics, dispatches
  through a canonical workspace-and-conversation instance id, and defines a
  narrow tool bound to the selected conversation.
- Trusted application code binds the Intercom token, API version, workspace,
  and conversation. Model input cannot select arbitrary workspaces,
  credentials, or API destinations.
- Node and workerd tests will execute the same exported SDK client factory
  against fail-closed injected Fetch under Flue's canonical
  `nodejs_compat` configuration.

Non-goals:

- App installation, OAuth, permission selection, workspace token lookup,
  webhook subscription setup, IP allowlist synchronization, deduplication,
  replay persistence, inbox policy, ticket workflows, or broad outbound
  support tools.
- Polling, long-lived transports, a closed union for every topic, or claims
  that top-level metadata has replay protection.

Foundation reflection to revisit after implementation:

- Whether the first package with a required unsigned `HEAD` validation route
  reveals any route-discovery or testing assumption.
- Whether open provider-native item typing plus typed delivery metadata is
  the right contract for broad, versioned catalogs.
- Whether relying on Flue's canonical `nodejs_compat` meaningfully simplifies
  future official-client selection without weakening the workerd execution
  gate.

Implementation:

- Added `@flue/intercom` with fixed `HEAD /webhook` endpoint validation and
  signed `POST /webhook` notification delivery, exact-byte Web Crypto
  HMAC-SHA1 verification, optional workspace restriction, body limiting, a
  complete-route deadline, open versioned topics, typed delivery metadata,
  raw verified input, and canonical workspace-scoped conversation identity.
- Added original Node and workerd protocol suites. They cover exact bytes,
  endpoint validation, ping and future topics, workspace mismatch, missing,
  malformed, and incorrect signatures, malformed envelopes, UTF-8 and JSON
  failures, media type, declared and streamed body limits, handler result
  serialization, invalid results, thrown handlers, cumulative route timeout,
  constructor validation, route publication, and conversation-key round
  trips.
- Added `examples/intercom-channel` with the official
  `intercom-client@7.0.3`, explicit API version `2.14`, trusted US/EU/AU
  region selection, grouped contact-initiated and contact-replied handling,
  canonical dispatch identity, a conversation-bound retrieval tool, and Node
  and workerd fail-closed SDK tests.
- Added `flue add intercom`, the Intercom connector recipe, setup and API
  docs, navigation and channel overview entries, README, changelog, lockfile,
  and publish preparation coverage.
- Added a focused runtime regression proving that an explicit discovered
  channel `HEAD` route receives the original request method through a mounted
  `flue()` application.
- Updated the channel-conformance skill and audit matrix to treat Flue's
  required `nodejs_compat` configuration as the canonical Cloudflare runtime.
  Node API use is acceptable when Cloudflare implements the required behavior;
  unsupported stubs and failed workerd execution still fail the gate.

Validation:

- Package build, strict typecheck, eleven Node tests, and two workerd ingress
  tests pass. Workerd executes exact-byte HMAC-SHA1 verification, the unsigned
  endpoint-validation route, future-topic delivery, and streamed body
  limiting with `nodejs_compat`.
- Example strict typecheck, Node official-client test, workerd official-client
  test, Node build, and Cloudflare target build pass. Both client tests execute
  the same exported factory with injected fail-closed Fetch; workerd observes
  the official SDK's `X-Fern-Runtime: workerd` header and Cloudflare-provided
  `process` and `Buffer`.
- A built Node application returned `200` for `HEAD`, returned an empty `200`
  for an original locally signed future topic, and returned `401` when the
  same signature accompanied a changed body.
- The generated full Flue Cloudflare Worker was started through Wrangler's
  local workerd runtime with its real `nodejs_compat` configuration and bound
  environment variables. The same discovered `HEAD`, valid signed `POST`, and
  tampered `POST` requests returned `200`, `200`, and `401`.
- The focused mounted-runtime routing suite passes all 33 tests, including the
  explicit `HEAD` regression, and runtime strict types pass.
- The full CLI suite passes: 55 Node tests and 24 Vitest tests. The generated
  connector index lists Intercom, the built CLI prints the intended recipe,
  and the connector website build serves `/cli/connectors/intercom.md`.
- Documentation check and production build pass with zero diagnostics and
  generate the Intercom guide and API reference.
- Publish preparation and package packing pass. The tarball contains 99
  intended distribution, prepared documentation, README, license, and
  manifest files, with no source, tests, build configuration, or
  `node_modules`.
- A clean strict TypeScript consumer installed only the packed
  `@flue/intercom` package and TypeScript, compiled a custom Hono environment,
  imported the constructor at runtime, and exercised canonical identity.
- A separate clean workerd consumer installed the packed package and executed
  signed notification verification under `nodejs_compat`.
- Focused Biome, Prettier, whitespace, and credential-pattern checks pass.
  The repository lint gate completes with unrelated existing warnings in
  runtime, Postgres, Notion, and CLI files. No Intercom test or build contacted
  Intercom.

Corrections and deviations:

- Direct Hono test applications transform `HEAD` dispatch through `GET`, so a
  naive `app.on('HEAD', ...)` package harness returned `404` even though Flue's
  channel dispatcher preserves the original method. The provider tests now
  mirror channel dispatch, and a mounted-runtime regression proves the actual
  discovered route. No runtime routing code change was necessary.
- The official SDK's latest installable npm release is `7.0.3` and its
  generated REST API version surface ends at `2.14`, while current webhook
  documentation is `2.15`. The example pins both the package and API version
  instead of sending an unsupported raw `2.15` header. Webhook items remain
  open and version-tolerant.
- Earlier provider work treated execution without `nodejs_compat` as a
  desirable stricter gate. Flue already requires and configures
  `nodejs_compat`, and Cloudflare implements the `process` behavior used by the
  official Intercom SDK. The conformance policy now validates the real Flue
  environment instead of working around supported Node APIs.
- Documentation review called out invalid UTF-8 as a claimed failure mode.
  Exact-byte signed invalid UTF-8 coverage was added before accepting that
  claim.

Foundation reflection:

- Required unsigned `HEAD` validation fits the existing route declaration and
  discovery model. It did reveal that direct Hono test mounting is not a
  faithful harness for explicit `HEAD` routes, so the shared mounted-runtime
  regression is warranted. No public routing abstraction or implementation
  change is needed.
- Open provider-native item typing is the honest contract for Intercom's broad
  API-versioned topic catalog. Typed workspace, notification, timing, and
  attempt metadata still provide a useful durable envelope without publishing
  false per-topic guarantees.
- Flue's canonical `nodejs_compat` environment makes the official SDK the
  strongest example client and avoids an unnecessary custom Fetch wrapper.
  Actual SDK execution in workerd remains the meaningful compatibility gate.
- Fixed discovery, multi-method route suffixes, the single-object callback,
  normal response handling, project-owned clients and tools, and canonical
  conversation identity all held. No additional shared machinery is
  justified.

Focused review:

- One focused independent review found no concrete correctness, security,
  provider protocol, Hono routing, timeout or body handling, type-contract,
  Cloudflare, SDK example, packaging, documentation, recipe, or durable test
  gap.
- Residual risks are provider-owned or explicitly documented: Intercom has no
  signed timestamp or replay window; its acknowledgment documentation
  conflicts between exactly `200` and any `2xx`; topic payloads remain broad
  and API-versioned; and the example proves the shown
  `conversations.find()` SDK path rather than every SDK operation.

### Zendesk implementation — 2026-06-13

Status:

- Complete.

Primary sources:

- Zendesk webhook overview, request anatomy, signature verification, creation,
  retry, circuit-breaker, webhook API, common event schema, ticket event,
  Messaging event, API authentication, API-token, OAuth, and Show Ticket
  documentation.
- Zendesk's official Node API client guidance, which identifies the available
  Node package as community maintained rather than officially supported.
- Current Cloudflare Workers Node.js compatibility, Fetch, Web Crypto, and
  workerd-testing documentation.

Clean-room affirmation:

- The design and fixtures derive from Zendesk's primary specifications and
  original synthetic payloads. No third-party adapter implementation, types,
  fixtures, payloads, snapshots, or tests are being copied or translated.

Eligibility:

- Eligible for Zendesk's signed stateless event-subscription requests.
  Zendesk sends one JSON event by `POST`, signs the timestamp concatenated
  directly with the exact body using HMAC-SHA256, and supplies account,
  webhook, and invocation identity headers.
- Zendesk documents a 12-second timeout, retry behavior for `409`, `429`,
  `503`, and timeouts, possible duplicate or omitted delivery, and a
  circuit-breaker policy. It does not define a timestamp acceptance window or
  freshness check, so Flue will verify the signed timestamp without inventing
  replay semantics.
- Event-subscription payloads have a durable common envelope but an open
  provider catalog. Ticket events are documented, while Zendesk also directs
  ordinary ticket-activity integrations toward customizable triggers and
  automations. The package will preserve future event types and versions
  rather than claiming complete closed unions.
- A project-owned Fetch client is the canonical outbound path. Zendesk has no
  officially supported Node server SDK, while native Fetch and the Node APIs
  used for Basic authentication execute in Node and Flue's required
  `nodejs_compat` Workers runtime.

Design:

- Add `@flue/zendesk`, `examples/zendesk-channel`, `flue add zendesk`, a setup
  guide, and an API reference.
- Publish fixed `POST /webhook` for signed JSON event subscriptions. Do not
  publish validation, custom-trigger, Sunshine Conversations, or AI Agent
  routes in this initial package.
- Accept `signingSecret`, optional `accountId`, optional `webhookId`,
  `bodyLimit`, and `handlerTimeoutMs`.
- Verify `X-Zendesk-Webhook-Signature` against
  `X-Zendesk-Webhook-Signature-Timestamp + exact body` with Web Crypto before
  UTF-8 decoding or parsing. Require and expose account, webhook, invocation,
  and signature-timestamp headers.
- Parse JSON without rounding unsafe numeric identifiers. Normalize the
  integer payload `account_id` to a decimal string, require it to match the
  provider account header, and apply configured account and webhook
  restrictions before application code runs. The HMAC authenticates the
  timestamp and body, not the identity headers; header comparisons are
  consistency checks around an otherwise authenticated delivery.
- Deliver a typed `ZendeskWebhookEvent` containing delivery metadata plus the
  provider event id, open type, open schema version, subject, event time,
  provider-native `detail` and `event` objects, complete parsed envelope, and
  exact decoded body. Treat the signed event id as the durable deduplication
  input; unsigned invocation metadata is only for attempt correlation.
- Expose canonical account-scoped ticket identity helpers. Applications
  select a validated ticket id only from event families they handle; the
  package does not claim every Zendesk event refers to a ticket.
- Apply a complete-route deadline defaulting to and capped at 11 seconds,
  leaving time before Zendesk's 12-second timeout. Return retryable `409` for
  channel-owned failure, invalid handler results, and timeout. Do not start
  the callback if body processing has already exhausted the deadline.
- Preserve the established result contract: no value becomes empty `200`,
  JSON-compatible values become JSON, and normal Hono or Fetch responses pass
  through.

Dependencies and example:

- `@flue/zendesk` depends on Hono and `lossless-json`; it does not depend on a
  provider SDK or `@flue/runtime`.
- The editable example exports a narrow project-owned Fetch client, handles
  selected ticket events with grouped switch cases, dispatches through a
  canonical account-and-ticket instance id, and defines a ticket-retrieval
  tool bound to that verified identity. The client uses `lossless-json` so
  outbound Zendesk identifiers cannot be silently rounded.
- Trusted application code binds the Zendesk subdomain, account, email, token,
  and ticket. Model input cannot choose an arbitrary account, host,
  credential, or ticket.
- Node and workerd tests will execute the same exported client against
  fail-closed injected Fetch and prove the exact `GET
  /api/v2/tickets/{id}.json` request under Flue's canonical `nodejs_compat`
  configuration.

Non-goals and deferrals:

- Webhook creation, trigger or automation setup, customizable non-JSON
  payloads, destination Basic/bearer/API-key authentication, OAuth,
  installation state, token storage, deduplication, replay persistence,
  ticket workflow policy, or broad outbound support tools.
- Sunshine Conversations uses a separate unsigned API-key protocol with
  batching and different retry semantics. It remains a possible future
  optional route, not part of the initial callback.
- Zendesk AI Agent webhooks remain deferred because current official
  documentation does not specify trustworthy inbound authentication, retry,
  timeout, or delivery identity semantics.

Foundation reflection to revisit after implementation:

- Whether authenticated body identity plus duplicate provider header identity
  reveals a useful shared validation pattern or should remain
  provider-specific.
- Whether lossless normalization of a required numeric tenant id belongs only
  in Zendesk or exposes broader JSON identity guidance.
- Whether the open common-envelope contract remains sufficient for both
  mature ticket events and future event families without a universal schema.

Implementation:

- Added `@flue/zendesk` with one fixed `POST /webhook` route for signed JSON
  event subscriptions. It verifies HMAC-SHA256 over the exact timestamp and
  body bytes, requires Zendesk delivery metadata, parses unsafe integer ids
  losslessly, checks signed body account identity against header metadata,
  supports optional account and webhook restrictions, preserves open event
  types and schema versions, and exposes canonical account-scoped ticket
  identity.
- Added original Node and workerd protocol suites covering valid and tampered
  exact bytes, malformed and missing authentication, unsigned metadata
  mismatch, configured identity restrictions, malformed UTF-8 and JSON,
  unsafe ids, media type, declared and streamed body limits, future event
  types, handler results, application failure, cumulative route deadlines,
  route publication, and ticket-key round trips.
- Added `examples/zendesk-channel` with a project-owned Fetch client, grouped
  ticket-event handling, canonical dispatch identity, and a narrow
  ticket-retrieval tool bound to the selected account and ticket. The client
  uses `lossless-json` for response parsing so Zendesk ids cannot be silently
  rounded.
- Added `flue add zendesk`, the Zendesk connector recipe, setup and API docs,
  navigation and channel overview entries, README, changelog, lockfile, and
  publish preparation coverage.

Validation:

- Package build and strict typecheck pass. Thirteen Node ingress tests and
  three workerd ingress tests pass; workerd executes exact-byte verification,
  account consistency checks, streamed body limiting, and canonical identity
  under Flue's required `nodejs_compat` configuration.
- Example strict typecheck passes. Two Node client tests and one workerd client
  test execute the project-owned client against fail-closed fake Fetch and
  preserve unsafe identifiers. Node and Cloudflare target builds pass.
- A built Node application returned `200` for an original locally signed
  event and `401` for a changed body with the original signature.
- The generated full Flue Cloudflare Worker ran under Wrangler's local workerd
  runtime with its real `nodejs_compat` configuration. An original signed
  future event returned `200`, and the same signature over a changed body
  returned `401`.
- The full CLI suite passes: 56 Node tests and 24 Vitest tests. The generated
  connector index lists Zendesk, the built CLI prints the intended recipe,
  and the connector website build serves `/cli/connectors/zendesk.md`.
- Documentation check and production build pass with zero diagnostics and
  generate the Zendesk guide and API reference.
- Publish preparation and packing pass. The tarball contains 101 intended
  distribution, prepared documentation, README, license, and manifest files.
  A clean strict TypeScript consumer compiles and imports the packed package,
  and a separate packed-package workerd consumer executes signed verification
  with `nodejs_compat`.
- Focused Biome, Prettier, whitespace, and credential-pattern checks pass. The
  repository lint gate completes with unrelated existing warnings. No test or
  build contacted Zendesk.

Corrections and deviations:

- Zendesk's signature covers the timestamp and exact body, but not the account,
  webhook, or invocation headers. Public types and docs now distinguish signed
  payload identity from unsigned provider routing metadata. Payload
  `account_id` must match the account header; configured account and webhook
  checks are additional consistency restrictions, not claims that the HMAC
  independently authenticates those headers.
- Zendesk retries `409`, while generic `500` behavior is not part of its
  documented retry contract. Channel-owned application failures, invalid
  handler results, and route timeouts therefore return `409`. Explicit
  application `Response` values still pass through unchanged.
- The complete-route deadline now checks elapsed processing before invoking
  the application callback. If receipt, verification, parsing, or identity
  checks consume the deadline, application work is not started.
- The example client initially used ordinary JSON response parsing. Zendesk
  identifiers can exceed JavaScript's safe integer range, so the final client
  uses `lossless-json` and validates the returned ticket shape without
  rounding ids.
- Zendesk's documentation is inconsistent about whether event subscriptions
  are broadly available for ticket activity or whether integrations should
  use customizable triggers and automations. The package targets only the
  provider-defined JSON event-subscription envelope and documents the
  ambiguity instead of pretending custom payloads have the same contract.
- Cloudflare compatibility assumes Flue's canonical `nodejs_compat`
  configuration. The example may use `Buffer` for Basic authentication;
  actual Node and workerd execution, not avoidance of supported Node APIs, is
  the compatibility gate.

Foundation reflection:

- Signed body identity plus unsigned duplicate header metadata is
  provider-specific. It does not justify a shared identity-validation
  abstraction because providers differ on which fields their signatures
  cover and what consistency checks are meaningful.
- Lossless JSON parsing is required where provider-defined numeric identifiers
  can exceed JavaScript's safe range. This is useful cross-provider guidance,
  but parser choice and normalization remain local to each provider contract.
- The open common-envelope contract preserves future Zendesk event types
  without inventing a universal event schema. Typed delivery metadata and
  canonical ticket identity remain useful while applications validate the
  provider-native fields for the event families they handle.
- Fixed discovery, the single-object callback, normal response passthrough,
  project-owned clients and tools, and the `nodejs_compat` workerd gate all
  held. No shared runtime machinery change is justified.

Focused review:

- One independent review identified concrete gaps in signed-versus-unsigned
  identity documentation, Zendesk-specific retry responses, callback admission
  after pre-handler timeout, and lossless outbound response parsing. Each was
  corrected and covered before the final pack and runtime checks.
- Residual risks are provider-owned or intentionally deferred: Zendesk
  specifies no signature freshness window; delivery can be duplicated or
  omitted; header metadata is not independently signed; event-subscription
  availability is documentation-dependent; and already-started JavaScript
  cannot be forcibly cancelled after a timeout.

## 6. Keep These As Separate Product Decisions

### Generic HTTP or webhook adapter

Flue already supports `flue add <provider-docs-url> --category channel` and a
custom-channel guide. A generic package cannot safely supply provider
verification, identity, retry, or response semantics.

Improve the custom-channel recipe, reusable test fixtures, and conformance
helpers before considering a generic runtime abstraction. Public demand:
<https://github.com/vercel/chat/issues/96>.

### Agent Client Protocol

ACP may be a direct agent transport rather than a provider webhook channel.
Evaluate its routing, session identity, streaming, and authentication against
Flue's existing agent HTTP and WebSocket surfaces before assigning ownership.
Public request: <https://github.com/vercel/chat/issues/552>.

## 7. Unsupported Transport Classes

Slack Socket Mode, Discord Gateway, Telegram polling, and similar persistent
connections are out of scope. They require lifecycle, reconnection, cursor,
heartbeat, and durable ownership semantics that the current HTTP channel model
does not provide.

Do not add a provider that requires one of these transports. Reconsider this
only through a separate product decision that intentionally introduces a
long-lived transport model; do not approximate it through channel route
declarations.

## 8. Final Seventeen-Provider Audit

The final portfolio audit completed after Salesforce Marketing Cloud.

### WhatsApp BSUID review correction

An independent portfolio review found that the WhatsApp channel rejected
Business-Scoped User ID payloads that Meta began rolling out in early April
2026. Current official documentation allows incoming message `from` and status
`recipient_id` phone fields to be omitted while supplying `from_user_id`,
contact `user_id`, and `recipient_user_id`.

Design brief:

- Keep `@flue/whatsapp`, `channels/whatsapp.ts`, and the existing GET/POST
  `/channels/whatsapp/webhook` surface.
- Continue exact-byte HMAC verification and fixed business-account and business
  phone-number checks before normalization.
- Preserve optional phone numbers, BSUIDs, parent BSUIDs, usernames, and
  profile names in typed message, sender, and status values. Require at least
  one usable sender or recipient identity for legacy-compatible payloads.
- Model individual conversation destinations explicitly as either a phone
  number or a BSUID. Prefer the BSUID when Meta supplies both, keep groups
  keyed by group id, and encode the destination kind in canonical keys so
  equal strings in different identity namespaces cannot collide.
- Keep the broad Kapso SDK in the editable example for supported phone and
  group sends. Add a narrow project-owned Fetch path for BSUID sends because
  the current SDK release accepts only `to`, while Meta requires `recipient`
  when no phone number is available.
- Exercise BSUID-only messages and statuses, malformed missing identity,
  canonical phone/BSUID/group keys, and outbound `recipient` request
  construction with original synthetic fixtures in Node and workerd under
  Flue's required `nodejs_compat`.
- Keep `user_id_update` and other unmodeled webhook fields observable through
  the verified unknown-event path. Broader WhatsApp event expansion remains
  demand-driven.
- Do not add outbound behavior to the Flue package, contact Meta, or introduce
  shared identity machinery. This correction is provider-specific and
  review-driven.

Resolution:

- Primary evidence came from Meta's current Business-Scoped User ID
  documentation and its June 12, 2026 changelog, plus Cloudflare's current
  Node.js compatibility documentation. Meta documents that incoming messages
  now include `from_user_id`, contacts include `user_id`, status events include
  `recipient_user_id`, and the corresponding phone fields can be omitted.
  BSUID-only outbound messages use `recipient` instead of `to`.
- `@flue/whatsapp` now accepts legacy phone-only, combined phone-and-BSUID, and
  BSUID-only messages and statuses. It preserves parent identifiers and
  usernames, verifies contact/message identity consistency, prefers the BSUID
  for individual conversation identity when available, and keeps group
  identity provider-native.
- Individual conversation references now contain an explicit `phone-number` or
  `user-id` destination. Canonical keys encode the destination namespace;
  original tests prove that equal phone and BSUID strings do not collide and
  that phone, BSUID, and group keys round trip.
- The editable example still exports the real Kapso `WhatsAppClient`. Its
  project-owned `sendTextMessage()` helper uses the SDK's ordinary text helper
  for phone and group destinations and its authenticated low-level
  `request()` method for Meta's BSUID `recipient` payload. Credentials remain
  configured once.
- Original synthetic Node coverage now includes BSUID-only messages and
  statuses, combined identity preference, contact metadata, missing-identity
  rejection, and collision-safe keys. Workerd executes a signed BSUID-only
  incoming message. Example Node and workerd tests execute the real SDK against
  fail-closed fake Fetch for phone, BSUID, and group sends.
- Package build, strict typecheck, ten Node tests, and one workerd test pass.
  Example strict typecheck, one Node client test, one workerd client test, Node
  build, and Cloudflare build pass under Flue's required `nodejs_compat`
  configuration.
- The built Node application returned `200` for an original locally signed
  BSUID-only message and `401` for the same signature over changed bytes. The
  generated Cloudflare Worker ran under Wrangler's local workerd and returned
  `200` for an original signed BSUID-only status and `401` after byte
  tampering. A message smoke reached the example's dispatch path and then hit
  the already-recorded missing Durable Object migration warning, so the
  channel-only Worker smoke intentionally uses the non-dispatching status case.
- The full CLI suite passes with 57 Node tests and 24 Vitest tests, including
  the generated WhatsApp recipe. Documentation check and the 99-page
  production build pass, and the connector site emits the WhatsApp recipe.
- Publish preparation passes. The packed WhatsApp artifact contains 103
  intended files and no source, tests, workerd configuration, environment
  files, or dependencies. A fresh strict TypeScript consumer compiles the new
  identity surface, imports the constructor in Node, and executes the packed
  package in workerd with `nodejs_compat` and `process` available.
- No Meta API was contacted. Fixtures and request bodies are original and
  synthetic. The independent review's BSUID finding is resolved; no additional
  shared machinery change or new product deferral is warranted.

Compatibility-policy correction:

- Flue's Cloudflare target requires `nodejs_compat`; workerd tests should
  reproduce that environment instead of treating the absence of Node APIs as
  a stronger compatibility property.
- Cloudflare's current official Node.js compatibility documentation confirms
  implementations for supported APIs including `process` and `Buffer`.
  Imports backed only by non-functional compatibility stubs remain
  unacceptable.
- All 17 package workerd configurations and all 17 example workerd
  configurations now enable `nodejs_compat`.
- Recipes, guides, and example READMEs no longer tell developers to avoid
  `process.env`, `Buffer`, or `nodejs_compat`. Projects may use
  `process.env` or typed Worker bindings according to their credential
  convention.
- Resend and Shopify workerd tests no longer erase `process` and `Buffer`.
  They execute the same verification and fake-client paths in Flue's actual
  Workers environment and assert that the compatibility globals exist.

Portfolio validation:

- All 17 packages pass build, strict typecheck, 206 combined Node tests, and
  28 combined workerd tests.
- All 17 editable examples pass strict typecheck, 31 combined Node/workerd
  client tests, Node builds, and Cloudflare builds. Node and Cloudflare build
  groups were rerun separately so their shared per-example `dist/` directories
  could not race.
- The full CLI suite passes with 57 Node tests and 24 Vitest tests. The real
  built connector registry contains all 17 named channels.
- Documentation diagnostics report zero errors, warnings, or hints. The
  production docs build emits 99 pages, and the connector site builds every
  named channel recipe.
- `npm install --frozen-lockfile` and `node scripts/prepare-publish.mjs`
  pass.
- Every channel package packs to an intentional 103-file artifact containing
  its manifest, built runtime, declarations, README, license, and prepared
  documentation without source, test, workerd-config, environment, or
  `node_modules` leakage.
- One clean consumer installed all 17 tarballs together, passed strict
  TypeScript, imported every constructor in Node, and imported every
  constructor in workerd with `nodejs_compat`.
- The scoped 302-file channel lint is clean. Repository-wide lint and knip
  complete successfully with unrelated existing Biome warnings in runtime,
  Postgres, and CLI files.
- Formatting, whitespace, stale compatibility-claim, and credential-pattern
  checks pass. The only PEM values are explicitly synthetic Google Chat test
  material and a redacted README example.
- No provider API was contacted. Verification used original synthetic webhook
  bodies, local signatures or tokens, fake outbound transports, and local
  workerd execution.

Audit corrections:

- Removed an accidental standalone export for the Salesforce Marketing Cloud
  example callback response shape.
- Removed one unused Hono type import from the Notion package.
- Corrected the final stale Telegram connector claim that treated execution
  without `nodejs_compat` as a stronger compatibility property. The regenerated
  CLI recipe and connector site build pass.
- Cloudflare builds still report the known missing Durable Object migration
  warning for examples. This remains outside channel ownership because the
  examples prove integration and runtime compatibility rather than turnkey
  deployment history.
- Upstream packages emit missing-sourcemap and `punycode` deprecation warnings
  during some tests. They do not affect runtime behavior or the passing gates.

Foundation reflection:

- Fixed discovery, provider-specific routes, extensible `{ c, event }`
  callbacks, normal Hono/Fetch response handling, application-owned clients
  and tools, and provider-native identity all held across 17 materially
  different providers.
- The portfolio still does not justify a universal event schema, generic
  outbound client, installation framework, generic authentication layer, or
  long-lived transport abstraction.
- Lossless JSON, exact-byte verification, identity consistency checks,
  handshakes, batching, deadlines, and retry responses remain
  provider-specific where their protocols require them.
- The one justified shared audit correction was environmental: workerd tests
  should model Flue's canonical `nodejs_compat` target consistently.

## Suggested Sequence

1. Choose a coordinated version and release the completed 17-provider
   portfolio with the required runtime, CLI, docs, and connector deployment.
2. Repeat the clean-consumer and example checks against the actual published
   packages and deployed connector registry.
3. Reassess existing HTTP provider expansions and new providers only from
   concrete user demand after the first channel release has adoption data.

No additional channel was added during the final cross-provider audit.
Starting another provider after this point requires a fresh research,
implementation, testing, and audit cycle; the candidates and deferrals above
are better handled as independent workstreams.
