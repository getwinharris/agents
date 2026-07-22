---
title: bapX Development
description: Public source, CLI, documentation, and contribution contracts for developers building bapX.
---

bapX is built publicly in [`getwinharris/agents`](https://github.com/getwinharris/agents). The repository `AGENTS.md`, `OBJECTIVE.md`, `TODO.md`, maps, issues, discussions, pull requests, tests, and changelog are the source of truth for shipped and planned work.

The bapX CLI is the repository's build, development, validation, and map tool. Its command reference is published in the [CLI documentation](/docs/cli/docs/). Product users operate hosted capabilities through Platform, Agents, Admin, API, MCP, and connectors; they do not need to install the CLI merely to use a hosted account.

Non-sensitive architecture, extension points, source ownership, schemas, and development workflows belong in these public docs. Credentials, private host locations, incident procedures, secret rotation, and exploitable infrastructure details remain restricted.

Every product change must update its tests, public developer/customer documentation, operational documentation, maps when structure changes, and `CHANGELOG.md` before it is shipped. See [Contributing](/docs/reference/contributing/) for the issue, discussion, branch, review, and validation workflow.
