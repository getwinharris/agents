---
type: "Internal Doc"
title: "Code-to-docs shipping workflow"
description: "Documentation updates happen with the code that changes behavior. They are required before commit, pull request, merge, or shipping."
---
# Code-to-docs shipping workflow

Documentation updates happen with the code that changes behavior. They are required before commit, pull request, merge, or shipping.

## 1. Inspect and classify

Read the active `AGENTS.md`, then query the authorized knowledge root before editing:

```bash
bapX okf query --root <authorized-root> "<customer outcome and component terms>"
```

Read the returned evidence, nearest `index.yaml`, `OBJECTIVE.md`, `TODO.md`, and `map.mmd`. Trace outcome → owner → source → route/API → docs → deployment → live check, and record the first missing or contradicted edge in the owning issue. The prompt supplies intent; repository and live evidence supply product truth.

After implementation, compare the complete code diff against each class:

| Change class | Required owner |
| --- | --- |
| Stable external Platform, MCP, API, connector, agent-operation, workspace, CLI, build, SDK, runtime, or developer behavior | `apps/www/src/content/docs/` |
| Private host mechanics, internal deployment wiring, implementation topology, filesystem persistence, incident procedures, incomplete surfaces, or restricted operator checks | `internal-docs/` |
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

### Supported clean-install environment

The root package contract is Node 24 with the exact npm version declared by `packageManager` in `package.json`. When the VPS host does not provide that toolchain, validate a clean install in the pinned container without changing host packages:

```bash
docker run --rm \
  -v "$PWD:/work" \
  -w /work \
  node:24-alpine \
  sh -lc 'npx --yes npm@11.6.2 ci --no-audit --no-fund'
```

Regenerate `package-lock.json` only from a checkout with no `node_modules/` directory. A stale install tree can cause `npm install --package-lock-only` to preserve missing optional or transitive entries. Review the lockfile diff, then prove it with `npm ci` in a second clean environment.

The current install warnings are owned upstream: `scmp@2.1.0` comes through the Twilio development package; `prebuild-install@7.1.3` comes through optional MongoDB zstd support; `node-domexception@1.0.0` comes through the Google GenAI dependency chain; and `uuid@10.0.0` comes through Microsoft Bot Framework schema. Track upgrades at those direct owners instead of adding root overrides that can violate their supported ranges.

## 4. Record evidence

The commit/PR/ship evidence must include:

```text
Code changed:
Public docs changed: <paths or not applicable + reason>
Internal docs changed: <paths or not applicable + reason>
Maps/demo docs changed: <paths or not applicable + reason>
Changelog/blog changed: <paths or not applicable + reason>
Validation: <commands and rendered routes>
OKF query: <root, terms, and evidence paths>
Map path: <outcome -> owner -> source -> route -> deployment -> live check>
Missing connection resolved: <edge and proof>
```

A passing code test does not waive documentation. A passing docs build does not prove server behavior. Shipping is blocked when an applicable documentation owner is stale.

## 5. Continue through production

A PR is durable review state, not the end of an agent task. The authorized agent handling it reads checks and review threads for the exact SHA, fixes supported failures, reruns validation, merges when permitted, deploys the merged SHA immediately, and performs live browser/API checks without waiting for another prompt.

If authority, credentials, or an external dependency requires a handoff, record the exact SHA, evidence, blocker, next action, and completion condition. On resumption, query OKF and inspect that durable state instead of replaying the original prompt. After live verification, repeat the query and map traversal to find stale documentation, disconnected functions, or the next evidenced gap.
