---
title: bapX Repository Development
description: Public source, documentation, and contribution contracts for bapX maintainers.
---

bapX is built publicly in [`getwinharris/agents`](https://github.com/getwinharris/agents). The repository `AGENTS.md`, `OBJECTIVE.md`, `TODO.md`, maps, issues, discussions, pull requests, tests, and changelog are the source of truth for shipped and planned work.

The bapX CLI is internal repository build, development, validation, docs, and map tooling. It is not an installable customer product. Its non-sensitive command pages remain available as maintainer reference, while public framework developers should use the runtime API, SDK, and deployment contracts surfaced under **Developers**.

Non-sensitive architecture, extension points, source ownership, schemas, and development workflows belong in these public docs. Credentials, private host locations, incident procedures, secret rotation, and exploitable infrastructure details remain restricted.

Start with the public contracts:

- [Source Ownership](/docs/reference/source-ownership/) — which source owns each surface and where new work belongs.
- [Platform Auth and Workspace Contract](/docs/reference/platform-auth/) — public identity, connector, Admin, Agents, and OKF routing boundaries.
- [Shipping Workflow](/docs/reference/shipping/) — docs, tests, map, browser, and release evidence required before merge.

Every product change must update its tests, public developer/customer documentation, operational documentation, maps when structure changes, and `CHANGELOG.md` before it is shipped.
