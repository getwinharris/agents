# Ecosystem Channel Guide Pattern

Use this pattern when writing or revising
`apps/docs/src/content/docs/ecosystem/channels/<provider>.md`. It is a shared
editorial model, not a rigid template. Provider semantics determine which
sections exist and how much detail each receives.

## Page Job

An ecosystem channel guide teaches a developer how to configure one provider,
receive its verified HTTP payloads, and compose the provider's established
client with application code. It is a provider guide, not package API
reference and not a restatement of the foundational Channels guide.

Link to the shared [Channels guide](/docs/guide/channels/) for common ownership,
file-based routing, response behavior, dispatch, authorization, and
deduplication concepts. Repeat a common concept only when a provider-specific
fact changes how the developer applies it.

## Recommended Shape

Start with:

1. A short provider-specific `subtitle` that communicates what developers can
   build without leading with package names.
2. A `package` header action linking the first-party package on npm. The shared
   docs header supplies the npm wordmark; do not add a duplicate package or API
   reference sentence to the page introduction.
3. An `Add <Provider>` section using `flue add channel <provider>`.

Present `flue add` as a command developers can run in their terminal or through
their coding agent. Describe the blueprint's result, including the channel
package, outbound client, generated channel module, and named exports when
those details help the reader understand the result.

Then cover the provider in this general order:

- configuration and credentials;
- supported inbound HTTP surfaces;
- one focused section per inbound surface;
- outbound client initialization;
- focused outbound examples;
- provider retry or delivery behavior;
- provider-specific runtime support or caveats.

Change or omit headings when the provider does not need them. Do not manufacture
empty sections for consistency.

## Configuration And Routes

Separate ingress verification credentials from outbound API credentials. Say
what each value authorizes or verifies without teaching installation, OAuth
storage, or token rotation unless the provider makes that unavoidable.

List exact discovered route paths in a simple table. Pair each path with the
provider's name for that surface and a link to the official provider
documentation. Put optionality and route-publication guidance after the table
so the table remains the section's immediate reference surface. Avoid
repeating the same route inventory elsewhere.

State optional route-publication behavior when the provider exposes optional
callbacks. Mention package-owned handshakes next to the surface they affect.

## Inbound Sections

Give each materially different provider surface its own subsection. Examples
should focus on that callback rather than showing an entire production module.
Use the provider's native payload name, fields, nesting, and discriminants.
Keep related inbound surfaces as subsections beneath the route inventory unless
one surface is substantial enough to need an independent top-level topic.

After the example, explain only the provider-specific facts needed to use it:

- authoritative payload types and how narrowing works;
- mandatory response or acknowledgement behavior;
- fields that represent delivery, workspace, tenant, or conversation identity;
- short-lived response URLs, interaction tokens, or other capabilities that
  must stay out of model context and durable history;
- valid provider deliveries that the channel deliberately leaves to
  application policy.

Keep response examples faithful to provider semantics. For example, do not
recommend an HTTP error when a provider expects a successful acknowledgement
plus an error message in the response body.

## Outbound Sections

Begin with the smallest useful client initialization snippet. State explicitly
that outbound operations belong to the provider SDK or project-owned Fetch
client, not the Flue channel package.

Give substantial examples descriptive top-level headings such as `Slack Tools`
or `Stream a reply`; do not group them beneath a generic `Examples` heading or
prefix their names with `Example:`. Keep each example focused on one
recognizable provider behavior. When showing an agent tool:

- bind credentials and destinations in trusted code;
- expose only intentionally variable values to the model;
- make clear that the tool is application code, not a generic tool exported by
  the channel package.

Do not front-load the page with a large combined channel, SDK, dispatch, and
tool example. Introduce those concepts progressively.

## Reliability And Runtime

Document provider-specific acknowledgement deadlines, retry headers, delivery
ids, ordering, or batching when they affect application behavior. Do not imply
that the stateless channel deduplicates requests.

Cloudflare claims require actual workerd evidence. Name the client operations
that were exercised when support is narrower than the SDK's full API surface.
Do not turn successful bundling into a claim that every provider SDK operation
works.

## Editorial Checks

- Preserve human-edited prose and framing. Address explicit comments and make
  broader stylistic changes only when required for accuracy or coherence.
- Prefer official provider links and current primary documentation.
- Distinguish channel-owned ingress behavior from provider SDK capabilities.
- Keep package options and type inventories in the API reference.
- Avoid dependency version numbers in narrative prose unless a specific
  version is required to explain compatibility or runtime support.
- Link common Flue concepts instead of repeating them in every provider guide.
- Use short topical sections rather than one oversized end-to-end example.
- Preserve meaningful provider differences instead of forcing identical
  headings or examples across every guide.

## Completion Audit

Before considering a channel guide complete, confirm:

- the subtitle describes a useful provider outcome rather than the package;
- the npm package appears in the shared header action, not introductory prose;
- `flue add` is presented as usable from a terminal or coding agent;
- ingress and outbound credentials are clearly distinguished;
- exact inbound routes appear once in a simple table, followed by optionality
  or handshake notes;
- each materially different inbound surface has a focused callback example;
- provider-native payload terminology, typing, responses, identity, and
  sensitive capabilities are explained only where they affect usage;
- the project-owned client is initialized before larger outbound examples;
- substantial examples use descriptive top-level headings instead of an
  `Examples` wrapper;
- retry, delivery, and runtime claims match the package tests and actual
  workerd evidence;
- package options and exhaustive type details remain in reference docs;
- no TODOs, duplicate route inventories, unsupported capability claims, or
  generic Flue concepts remain on the page.
