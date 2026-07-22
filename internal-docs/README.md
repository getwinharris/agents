# bapX internal documentation

This directory is the canonical implementation and operations reference for agents and maintainers working on the `getwinharris/agents` repository. It is not published on `docs.bapx.in`.

## Audience boundary

| Documentation | Audience | Content |
| --- | --- | --- |
| `apps/www/src/content/docs/` | External developers and customers | Stable, supported Platform, MCP, API, connector, agent-operation, and workspace contracts |
| `internal-docs/` | bapX agents and maintainers | Source ownership, implementation topology, filesystem paths, deployment mechanics, current wiring, known incomplete surfaces, validation, and shipping procedures |

Never put credentials or secret values in either surface. Public docs must not claim incomplete UI or endpoints are supported. Internal docs must identify incomplete wiring explicitly so another agent does not infer behavior from static markup.

Supported CLI, build, map, API, SDK, runtime, configuration, and developer contracts belong in public docs when they are stable enough for implementers and coding agents. Internal docs keep private host mechanics, deployment wiring, incident procedures, incomplete surfaces, and operational checks that should not be published.

## Current references

- [Platform and authentication implementation](platform-auth.md)
- [Admin operating surface](admin-surface.md)
- [Internal technical ecosystem](technical-ecosystem.md)
- [Blog publishing contract](blog-publishing.md)
- [Code-to-docs shipping workflow](shipping.md)

When code changes, update the closest relevant internal reference instead of creating disconnected notes or timestamped status files.
