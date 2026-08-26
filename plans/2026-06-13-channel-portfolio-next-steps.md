---
type: "Plan"
title: "Channel Portfolio Next Steps"
description: "The 17 first-party HTTP channel packages are implemented and have passed the"
---
# Channel Portfolio Next Steps

## Status

The 17 first-party HTTP channel packages are implemented and have passed the
final cross-provider audit, including the review-driven WhatsApp
Business-Scoped User ID correction. This roadmap starts after the current
branch is merged. It does not reopen the channel ownership boundary or
prescribe speculative core expansion.

## 1. Release The Portfolio

Release the channels as one coordinated product surface:

- choose the release version for the channel packages and any required
  runtime or CLI packages;
- publish all 17 `@flue/*` channel packages;
- deploy `apps/www` so `flue add <provider>` resolves every named recipe;
- publish the channel guides and API references;
- verify package, CLI, docs, and connector versions agree.

Release acceptance:

- install all published channel packages into a new strict TypeScript
  consumer;
- import every constructor in Node and workerd with Flue's required
  `nodejs_compat` configuration;
- build representative Node and Cloudflare examples from published packages;
- run every public `flue add <provider> --print` command against the deployed
  registry;
- confirm no public guide references an unpublished package or unavailable
  recipe.

Do not describe the editable examples as turnkey deployment projects. Their
purpose is to prove channel integration, project-owned clients and tools, and
Node/Workers compatibility.

## 2. Observe Real Adoption

After release, use concrete issues and application experience to decide which
existing packages need broader verified HTTP surfaces. Favor additions where
Flue can improve authentication, provider response semantics, typed ingress,
delivery identity, or canonical conversation identity.

Do not expand packages merely to mirror broad provider SDKs. Outbound API
breadth, generic tools, installation state, and authorization policy remain
application responsibilities.

## 3. Demand-Driven Channel Expansions

Potential expansions should be independent provider workstreams using the
channel-conformance skill:

- richer Slack HTTP event families;
- additional Discord HTTP interactions;
- broader Teams and Google Chat HTTP activity families;
- additional Linear, Telegram, WhatsApp, Twilio, and Messenger webhook
  families;
- provider-specific additions for the seven follow-up channels when official
  protocols and user demand justify them.

Each expansion must retain original synthetic fixtures, fake outbound
transports, Node execution, actual workerd execution with `nodejs_compat`, and
artifact/consumer checks.

## 4. Explicit Deferrals

These are not release blockers:

- generic Salesforce Sales Cloud or Service Cloud ingress;
- Salesforce Pub/Sub, Streaming API, Change Data Capture, and other
  persistent or subscription-managed transports;
- Salesforce Data 360/Data Cloud until a useful authenticated stateless HTTP
  contract is documented clearly enough to implement and test;
- Slack Socket Mode, Discord Gateway, Telegram polling, and all other
  long-lived transport classes;
- app or marketplace installation, OAuth callbacks, consent, credential
  storage, refresh, rotation, and revocation;
- webhook registration, renewal, and unregistration;
- generic outbound clients, provider-wide tool collections, and broad API
  coverage;
- a generic webhook package that cannot provide provider verification,
  identity, retry, and response semantics;
- ACP until it is evaluated as an agent transport rather than assumed to be a
  webhook channel.

If a future provider requires a long-lived transport, defer the provider until
Flue intentionally designs that transport class. Do not approximate it with
HTTP channel routes.

## 5. Maintenance

Use `.agents/skills/channel-conformance/` for every provider addition or
meaningful channel expansion. Keep conformance as an agent workflow rather
than a generic repository script because eligibility, identity, retries,
Cloudflare dependencies, and protocol responses require provider-specific
judgment.

Periodically refresh official provider and Cloudflare runtime evidence when
dependencies or compatibility dates change. Supported Node APIs are acceptable
under Flue's required `nodejs_compat`; actual workerd execution remains the
compatibility gate.
