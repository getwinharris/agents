# Code-to-docs shipping workflow

Documentation updates happen with the code that changes behavior. They are required before commit, pull request, merge, or shipping.

## 1. Inspect and classify

Read the active `AGENTS.md`, `map.mmd`, and affected source before editing. After implementation, compare the complete code diff against each class:

| Change class | Required owner |
| --- | --- |
| Stable external Platform, MCP, API, connector, agent-operation, or workspace behavior | `apps/www/src/content/docs/` |
| Internal CLI, build, map, development, or maintenance behavior | `internal-docs/` |
| Internal ownership, implementation topology, filesystem persistence, deployment mechanics, operational checks, or incomplete wiring | `internal-docs/` |
| Demo behavior | `demo/README.md`, `demo/docs/index.md`, and `demo/map.mmd` |
| Workspace/user/project OKF structure | Workspace `OKF.md`, `AGENTS.md`, maps, and public OKF docs |
| Public or release-facing behavior | `CHANGELOG.md` and, when applicable, blog/release content |

## 2. Update in the same change

Update every applicable owner. Do not copy internal implementation notes into public docs. Do not leave stable public behavior only in internal docs. Update existing documents when they own the topic; create a new document only when no current owner fits.

## 3. Validate the documentation as product

- Build `apps/www` for public documentation changes.
- Check the exact rendered `docs.bapx.in` route and its raw `/index.md` response.
- Run the relevant package tests/builds for the code change.
- Validate affected maps with `bapX map --check`.
- Use a real browser for UI-visible behavior.
- Search for stale terms, contradicted pricing, placeholders, dead links/buttons, and claims about incomplete wiring.

## 4. Record evidence

The commit/PR/ship evidence must include:

```text
Code changed:
Public docs changed: <paths or not applicable + reason>
Internal docs changed: <paths or not applicable + reason>
Maps/demo docs changed: <paths or not applicable + reason>
Changelog/blog changed: <paths or not applicable + reason>
Validation: <commands and rendered routes>
```

A passing code test does not waive documentation. A passing docs build does not prove server behavior. Shipping is blocked when an applicable documentation owner is stale.
