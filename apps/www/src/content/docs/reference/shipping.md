---
title: Shipping Workflow
description: Public code-to-docs, validation, and release evidence contract for bapX changes.
---

bapX changes ship with their evidence. A code, docs, UI, CLI, API, SDK, runtime, map, connector, or platform change is not complete until the affected public contract and validation path are updated.

## Required evidence

For each change, record which of these classes changed or why they do not apply:

| Change class | Public source |
| --- | --- |
| Customer-visible Platform, MCP, API, SDK, runtime, connector, or hosted behavior | Customer docs under `apps/www/src/content/docs/` |
| Supported CLI, build, docs, map, blueprints, configuration, or developer workflow | CLI/reference docs plus tests in the owning package |
| Source ownership, structure, or OKF workspace behavior | OKF docs, workspace map docs, and `map.mmd` when structure changes |
| Demo behavior | Demo README, demo docs, and demo map |
| Release-facing behavior | `CHANGELOG.md` and any public release/announcement/blog content |

Private host names, secret paths, incident procedures, and exploitable operations stay out of public docs. Stable developer contracts do not stay private merely because they mention the CLI or repository.

## Validation expectations

- Query the applicable OKF root with the customer outcome and component terms, then read the returned evidence and nearest folder index instead of relying on prompt context alone.
- Traverse `map.mmd` from the customer surface through owner, source, route, documentation, deployment unit, and live proof. Record and resolve the first missing or contradicted connection.
- Diagnose or reproduce the behavior before changing it.
- Search existing issues before creating a new one.
- Update source docs, not generated `dist/` output.
- Run the narrowest meaningful automated checks for the affected package.
- For UI-visible work, validate the real served page, not only the build.
- For docs-visible work, check both the rendered page and raw `/index.md` route.
- For OKF or structure work, regenerate and check the relevant `map.mmd`.
- After live verification, repeat the OKF query and map traversal to find stale claims, disconnected functions, or the next evidenced gap.

## Pull request to production

A pull request is a review checkpoint, not shipped behavior. An authorized agent continues through checks and review findings, fixes, merge, deployment of the exact merged commit, and live browser/API verification without waiting for another prompt. If authority, credentials, or an external dependency blocks continuation, the handoff records the exact SHA, evidence, next action, and completion condition.

Generated maps improve when their owning source relationships and indexes improve. Never hand-edit them to imply a route, deployment, or feature exists; a passing map check does not replace source or live verification.

## Merge readiness

Before merging, the pull request or commit evidence should state:

- affected files and user-visible behavior;
- automated checks run and exact blocked checks, if any;
- browser or live-route validation for UI/docs changes;
- public docs, internal docs, map, demo docs, and changelog status;
- linked issues for remaining confirmed gaps.
- OKF query evidence, verified map path, and the missing connection resolved.
