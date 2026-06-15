---
name: channel-conformance
description: Research, implement, review, and validate one first-party Flue HTTP channel across its package, example, channel blueprint, documentation, Node runtime, Cloudflare Workers runtime, and publish artifact. Use when adding a provider channel, expanding an existing channel's verified HTTP surface, auditing channel conformance, or evaluating whether a provider is eligible for the stateless webhook model.
---

# Channel Conformance

Build one provider channel to a release-ready state without releasing it. Treat
each provider as a test of Flue's channel foundation: preserve provider-native
semantics, compare the result with existing channels, and improve shared
machinery only when concrete cross-provider evidence justifies it.

Read the repository instructions and the active provider plan first. Read
[`references/audit-matrix.md`](references/audit-matrix.md) before designing the
package or declaring it complete.

## Preserve The Product Boundary

Flue owns:

- authenticated, verified HTTP ingress;
- fixed discovered routes beneath `channels/<name>.ts`;
- provider-native typed payloads and required protocol responses;
- delivery and canonical conversation identity where the provider supplies it;
- predictable Hono-compatible handler results.

The application owns:

- provider SDK or Fetch clients and credentials used for outbound operations;
- `defineTool()` definitions and authorization policy;
- app installation, OAuth, token storage, refresh, and rotation;
- webhook or subscription registration and renewal;
- deduplication and business persistence.

Do not add a universal event schema, generic outbound client, provider tool
collection, installation framework, or long-lived transport. Conversation keys
are identifiers, never authorization capabilities.

## Preserve Provider Payloads And Types

Provider-native payloads are the default channel contract. Before defining any
event, interaction, command, or webhook types, look for an authoritative
provider-maintained type package, provider SDK export, generated schema, or
well-maintained DefinitelyTyped package. Prefer re-exporting those types over
creating a parallel Flue model.

Pass the provider's parsed wire object through without renaming fields, moving
properties, filtering valid deliveries, or replacing provider discriminants
with Flue discriminants. Name the callback property for the provider surface,
such as `payload`, `interaction`, `command`, or another provider-native term;
there is no universal requirement to call it `event`. When the useful provider
object is an outer delivery envelope, prefer one unduplicated argument such as
`{ c, payload }` and let users access its nested fields directly.

Validate only what Flue needs to own the ingress boundary:

- authentication and replay protection;
- body and transport encoding;
- mandatory protocol handshakes or responses;
- configured application, tenant, or destination identity only when the
  provider protocol does not already bind it cryptographically and the
  constructor intentionally promises that restriction;
- the minimal structure required to route and invoke application code.

TypeScript types do not require exhaustive runtime schema validation after an
authenticated provider request. Forward authenticated deliveries to
application code unless the request is a package-owned protocol message.
Filtering bots, message subtypes, event families, and other valid provider
behavior is application policy. Workspace allowlists, tenant authorization,
and installation policy also remain application concerns unless they are an
explicit part of the channel's necessary verification contract.

Define local wire-shaped types only when no suitable authoritative type exists,
or when a narrow Flue-owned transport wrapper has no provider type. Keep field
names and nesting faithful to the provider. Do not add `unknown` variants,
normalized unions, or camel-cased mirrors merely to create consistency across
channels.

Avoid a large runtime dependency solely to acquire its types. A lightweight
authoritative type package may be a direct dependency and re-exported from the
channel package. If the only official types live inside a broad framework,
define the smallest provider-faithful local wire types needed for the surface.

## Establish Eligibility Before Implementation

Research current primary provider sources. Use official protocol,
authentication, retry, SDK, runtime, and API documentation or official source.
Browse because these details are time-sensitive.

Establish:

- the useful inbound HTTP surfaces and mandatory handshakes or responses;
- exact authentication and byte-preservation requirements;
- event families, batching, retries, delivery identity, and deadlines;
- stable provider, tenant, conversation, actor, and resource identity;
- whether useful ingress is stateless HTTP rather than polling or a persistent
  socket;
- a credible Node and Cloudflare Workers implementation path;
- the best authoritative provider-native type source and its dependency cost;
- an outbound SDK or narrow Fetch client suitable for the editable example.

Defer the provider when useful ingress requires a long-lived process, a
provider-managed service inside Flue, unverifiable inbound requests, or a
Node-only canonical path with no defensible Workers alternative. Record the
evidence and blocker rather than weakening the gate.

If a third-party implementation repository is supplied as an educational
reference, inspect only its public capability inventory and integration
requirements. Do not read or derive from its implementation, types, tests,
fixtures, snapshots, or payloads. Produce original code and synthetic fixtures
from primary specifications.

## Use Subagents Deliberately

When subagents are available, delegate independent side work such as:

- primary-source protocol and security research;
- Cloudflare and dependency viability research;
- focused package, workerd, docs, or artifact review;
- a final independent gap audit.

Tell every delegated agent that it must not spawn subagents. Give editing agents
disjoint ownership and tell them not to revert concurrent work. Do not delegate
the immediate blocking decision or final reconciliation. The primary agent
must inspect the evidence, resolve conflicts, and own correctness.

## Design From Provider Semantics

Before editing, write a short design brief in the active plan:

- package, blueprint, file, and route names;
- constructor inputs and optional surfaces;
- verification strategy and runtime dependencies;
- provider-native callback payload, authoritative type source, and
  forward-compatible delivery behavior;
- provider response and timeout behavior;
- delivery and conversation identity;
- example client choice and Cloudflare evidence;
- explicit non-goals and any deferrals.

Use the nearest existing packages as structural references, not templates to
copy mechanically. Constructor arguments and route count are provider-specific.
Prefer fixed route suffixes such as `/webhook`, `/events`, `/interactions`, or
another provider-native noun. Omitted optional handlers should omit their
routes unless the provider protocol requires an always-present endpoint.

Callbacks receive one extensible object preserving the Hono `Context`, such as
`{ c, payload }`, `{ c, interaction }`, or another provider-appropriate shape.
Use the established result contract unless the protocol requires stricter
behavior:

- no returned value becomes an empty successful response;
- a JSON-compatible value becomes the response JSON body;
- a normal Hono or Fetch `Response` passes through unchanged.

Required handshakes and interaction responses may have provider-specific
contracts. Verify requests before invoking application code.

## Implement The Complete Provider Slice

Implement the package, tests, example, channel blueprint, setup guide, API
reference, navigation, package preparation mapping, and changelog entry as one
provider workstream. Inspect current repository patterns because the package
set and build wiring may have changed.

When authoring the ecosystem guide, follow the shared editorial pattern in
[`../documentation-writer/references/ecosystem-channel-guides.md`](../documentation-writer/references/ecosystem-channel-guides.md).
Adapt it to provider semantics rather than forcing identical sections.

Keep package runtime dependencies minimal:

- use Hono directly for public context and handler types;
- add a standards-based authentication dependency only when it materially
  improves correctness;
- accept or depend on a provider SDK inside the channel package only when the
  provider's own verified-ingress API is the best cross-runtime implementation;
- otherwise keep provider SDKs in the editable example and channel blueprint.

The example must demonstrate the intended developer experience:

- export `channel`;
- export a real project-owned `client`;
- dispatch a useful verified event to an agent;
- show grouped `switch` cases where appropriate;
- define a narrow application-owned tool when an outbound operation is useful;
- bind destinations and credentials in trusted code;
- include route comments with the complete discovered URL;
- keep optional routes visible but commented out when that best teaches the
  provider without publishing unused surfaces.

Do not contact live provider APIs. Exercise the actual recommended client
against a fake transport in Node and workerd.

## Test Observable Contracts

Create original synthetic payloads from the protocol specification. Test public
behavior rather than private helpers.

Prove:

- valid and invalid authentication over exact request bytes;
- content type, malformed input, body limit, and required-header behavior;
- handshakes, mandatory acknowledgements, response serialization, errors, and
  deadlines;
- provider-native payload pass-through without field renaming or valid-event
  filtering;
- representative provider discriminants and an authenticated future or
  otherwise unmodeled discriminant when the type system permits it;
- tenant/application identity checks where configuration fixes that identity;
- delivery, batching, retry, and conversation identity semantics;
- optional route publication;
- actual execution in Node and workerd;
- the example's outbound request construction through a fake transport;
- Node and Cloudflare example builds.

Do not claim Cloudflare support from bundling alone. Execute the verification
path and canonical example client in workerd with Flue's required
`nodejs_compat` configuration. Node API usage is acceptable when Cloudflare
implements the required behavior, but imports backed only by non-functional
compatibility stubs are not. Actual workerd execution remains the gate.

## Audit Artifacts And Developer Surfaces

Run focused package and example checks during implementation, then the relevant
repository-wide gates. Prepare and pack the package, inspect the tarball, and
compile a clean strict consumer from packed artifacts. Exercise the named
blueprint through the real built `flue add` path and build the documentation and
blueprint registry.

Run a built-example webhook smoke test with locally generated valid and invalid
requests. Confirm that no test or build contacts the provider.

Use the audit matrix for the complete evidence set and adapt commands to the
current package scripts. Do not add a generic conformance script or duplicate
provider protocol assertions outside provider-owned suites.

## Run A Scope And Simplicity Audit

Before final review, examine every public option, type, validation branch,
helper, response path, and test for whether its value justifies making Flue
responsible for it. Prefer deletion and standard platform behavior when the
provider contract does not require custom machinery.

Apply these questions:

- Does request authentication already establish the identity that another
  constructor option or allowlist rechecks? Do not turn application
  authorization policy into channel verification without a concrete protocol
  requirement.
- Does a package-owned timeout actually cancel work? Do not race a callback
  against a timer when the callback can continue after the response; document
  the provider deadline and let applications admit durable work promptly.
- Is a local payload type current, useful, and otherwise unavailable? Type the
  smallest current provider surface that provides meaningful narrowing. Do not
  maintain deprecated or legacy schemas merely for completeness, but do not
  collapse valuable current provider types to `unknown` solely to reduce line
  count.
- Can standard Hono or Fetch responses express the contract? Avoid custom
  return APIs, redundant provider response aliases, recursive JSON validators,
  and package-specific error interception unless the protocol requires them.
  Preserve proven cross-realm response handling at the owning shared boundary.
- Does a public error give consumers a meaningful programmatic distinction?
  Prefer ordinary platform errors for invalid trusted helper inputs, but audit
  established cross-channel error patterns as a portfolio decision instead of
  making one provider inconsistent.
- Are internal callback signatures duplicating exported public input types?
  Reuse the public types so implementation and declarations cannot drift.

Classify review outcomes explicitly:

- safe cleanup that preserves public behavior;
- meaningful public simplification that requires approval;
- rejected deletion where the protocol, security boundary, or developer
  experience justifies the existing scope.

Record the classification and reasoning in the active plan. A channel is not
more conformant because it has more options, validation, types, or tests.

## Reflect On The Foundation

After the provider passes its focused checks, compare the work with every
existing channel and record:

- provider-specific differences that should remain local;
- repeated friction or duplicated correctness logic;
- assumptions in discovery, Hono typing, response handling, examples,
  packaging, docs, or workerd validation that this provider disproved;
- concrete improvements worth applying across affected channels.

Require a failure scenario or violated invariant before changing shared
machinery. Do not abstract merely because two providers look similar. When a
foundation improvement is clear and within scope, implement it across all
affected channels and rerun their relevant checks. When it changes public
direction or has broad uncertain impact, record and defer it for user review
without blocking unrelated provider work.

Append research, decisions, tests, deviations, deferrals, and reflection to the
active plan. If no provider plan exists, create a dated plan under `plans/`.

## Review, Commit, And Stop Before Release

Perform one focused independent review after implementation. Evaluate findings
against concrete correctness, durability, security, Cloudflare, and developer
experience risks; do not apply speculative scope expansion.

Commit the provider in a coherent validated state. Split commits when that
makes review or recovery materially clearer, but do not force a fixed commit
count.

Finish with:

- the implemented capability and route set;
- Node and workerd evidence;
- package, example, blueprint, docs, and artifact evidence;
- foundation improvements or suggestions;
- recorded deviations and deferrals;
- remaining risks.

Do not publish, deploy, tag, or version packages as part of an individual
provider run. Keep all channels release-ready and perform release preparation
only after the requested provider portfolio and final cross-provider audit are
complete.
