# agents Repository Instructions

## Scope

This repository is the bapX agent harness for `agents.bapx.in`. It owns the primary agent
harness and `@bapX/agent` package (forked from Bapx):

- **Product surface**: `agents.bapx.in`
- **Primary package**: `@bapX/agent`
- **GitHub source**: `getwinharris/agents`
- **Gateway**: `api.bapx.in/mcp`
- **Pricing**: ₹500/month includes 5 GB workspace storage, hosted agents/workflows, hosted search, browser sessions, Node.js project subdomains, TTS, and STT; additional storage is ₹100/GB/month up to 100 GB. Customers bring their own AI-provider and connector credentials.

Agents are TypeScript modules (`agents/<name>.ts`). Build agents that can spawn sub-agents,
use skills (search, deploy, browser), and collaborate via built-in team features.

---

## AGENTS Contract

`AGENTS.md` files are binding work contracts for their subtrees.

1. Read `/root/bapx.in/AGENTS.md` first when working inside the VPS workspace.
2. Every repository or independently managed project must have exactly one `AGENTS.md` at its root. The root `AGENTS.md` governs the entire repository or project.
3. After meaningful edits, re-check changed paths against the active root `AGENTS.md`.
4. Update the owning root `AGENTS.md` when purpose, structure, workflow, artifacts, contracts, or durable preferences change.
5. Keep AGENTS docs concise and operational. Delete stale or contradictory instructions instead of narrating history.

## Framework

The underlying framework (forked from Bapx) compiles agent and workflow projects
into deployable server artifacts.

## Terminology

```
Agent profile                 — one reusable `defineAgentProfile(...)` value
Agent definition              — one runtime initializer from `defineAgent(...)`
Agent module                  — `agents/<name>.ts`; default-exports an agent definition
└─ AgentInstance              — URL `<id>`; provided to `defineAgent(({ id }))`
   └─ Harness                 — runtime-initialized agent environment; defaults to name `"default"`
      └─ Session              — one `harness.session(name?)`; defaults to `"default"`
         └─ Operation        — one `session.prompt` / `skill` / `task` / `shell` call
            └─ Turn          — one LLM round-trip inside pi-agent-core
Workflow                     — `workflows/<name>.ts`; exports `run(...)`
└─ Workflow run/invocation    — unique `ctx.id === runId`; initializes local agent definitions via `init(agent)` when needed
```

Runs are workflow-only. Direct HTTP/WebSocket agent prompts and dispatched agent inputs operate within persistent sessions and must not be described as runs. `dispatch(...)` is identified by `dispatchId`; SDK `client.runs` and raw `/runs` APIs inspect workflow runs only.

Use `harness` as the variable name for the return value of `init()`. Agents have names; agent instances have ids; harnesses and sessions have names; operations have generated ids.

A blueprint is a Markdown implementation guide returned by `bapX add`; its kind is `sandbox`, `database`, `channel`, or `tooling`. Use “sandbox adapter” for project-owned implementations and generated `src/sandboxes/` paths while preserving serialized/runtime API identifiers and Microsoft Bot Connector terminology.

## Project Structure

- `OBJECTIVE.md` — Canonical product objective, surface ownership, Admin-to-Agents promotion model, GitHub adaptation, compatibility, browser, telemetry, documentation, and industrial delivery contracts.
- `TODO.md` — Evidence-gated product delivery sequence. A checked capability must be implemented, validated, documented, reviewed, and deployed to its stated surface; static navigation or planning does not count as shipped.
- `map.mmd` — Generated root map for admin/user overviews. Regenerate with `bapX map --root .`; validate with `bapX map --root . --check`.
- `apps/www/` — Tracked Astro web surface for `bapx.in`, `docs.bapx.in`, `blogs.bapx.in`, `platform.bapx.in`, `admin.bapx.in`, and related public pages. Do not create another frontend root for the same surfaces.
- `apps/agents-runtime/` — Production Node runtime for the authenticated `main` agent reached through the `apps/www` gateway. Keep it private behind the shared runtime token; browser clients never call its port directly.
- `apps/ecosystem-catalog.ts` — Canonical connection catalog shared by the landing and public Ecosystem. Every catalog entry must resolve to a customer-facing rendered page and raw Markdown route; internal install/build details remain excluded.
- `apps/www/admin/` — Admin subdomain application copied from the canonical demo by explicit product direction. It builds through the `apps-www` workspace into `apps/www/dist/admin/`; keep the copied Admin implementation aligned with relevant demo chat/runtime improvements without copying generated `dist` artifacts.
- `internal-docs/` — Source documentation for agents and maintainers. Publish its non-sensitive developer and CLI contracts on `docs.bapx.in`; keep secrets, private host details, incident procedures, and exploitable operations restricted.
- `docs/scheduled-research/` — Internal, source-grounded research records produced by approved recurring research workflows. Use plain Markdown without YAML frontmatter, maintain `index.md`, and organize records by durable category rather than provider-specific duplication.
- `platform.bapx.in` — Account, settings, billing, connector, API key, MCP, and observability control plane. Every account owns a user-level OKF workspace; every new or imported project lives under `users/<username>/<business-slug>/projects/<project-slug>/`. Platform configures the shared operating workspace; it is not a separate workspace product.
- `admin.bapx.in` — The bapX business operating surface scoped to `/root/bapx.in`. Reuse the canonical demo's real React agent conversation inside the existing `apps/www` build; preserve the workspace editor under Projects and follow `internal-docs/admin-surface.md`. Its integration menu is MCPs, not Plugins. Do not create a duplicate admin frontend.
- `agents.bapx.in` — The customer business operating surface scoped to `users/<username>/<business-slug>/` and its projects. It uses the same people, agents, automations, projects, and tool model as admin with customer-level authority.
- `demo/` — Canonical demo app source. Do not duplicate it as `users/demo`; adapt it only into real user projects when explicitly needed.
- `examples/` — Canonical integration examples. Do not duplicate examples under `users/` or `apps/`.
- `packages/runtime/` — Runtime library (`@bapX/runtime`): sessions, agent harnesses, tools, and sandbox plumbing.
- `packages/cli/` — Internal bapX build, operations, map, development, and maintenance tooling. It is not an installable customer product and must not be presented on `docs.bapx.in` as an external workflow.
- `examples/hello-world/` — General runtime integration fixture.
- `examples/cloudflare/` — Cloudflare integration fixture.
- `examples/imported-skill/` — Packaged skill and release fixture.

Agent and workflow sources use either `<root>/.agents/` or `<root>/`; when `.agents/` exists, the bare `agents/` and `workflows/` layout is ignored.

## Source-Grounded Work Order

For meaningful code, UI, docs, CLI, map, workflow, or structure changes:

1. Read the workspace and repo `AGENTS.md` chain.
2. Read `OBJECTIVE.md` and `TODO.md` for product work, then read `map.mmd` and follow affected nodes to source files.
3. Search with `rg` and inspect existing implementations before creating any file, route, command, service, view, workflow, generator, or navigation item.
4. Extend the existing owning source. Do not create unlinked helper scripts, parallel map generators, duplicate frontends, duplicate admin surfaces, or orphaned tools.
5. If functionality is a product operation, wire it into `packages/cli`, repo scripts, the admin surface, or the documented runtime workflow.
6. Update docs/content only from the repo's content sources, not from generated `dist/`.
7. Before finishing, check touched workflows for placeholders, dead buttons, duplicated fallbacks, stale labels, incomplete wiring, and missing docs/map updates.

Before acting, identify the capabilities and limitations of the current execution environment. A remote agent may expose any task-relevant tools or skills, so discover and use the available capabilities intelligently instead of assuming a fixed toolset or local checkout. When repository work runs through a connector-hosted environment, use its available GitHub connector or equivalent repository-management capability as the canonical path for reading and writing repository state. Check available capabilities before declaring work unavailable; never fabricate command output, repository state, browser results, or validation. Preserve the same `AGENTS.md`, architecture, GitHub workflow, documentation, and validation contracts in every environment.

## Product Development Docs

Keep the two documentation audiences separate:

- `apps/www/src/content/docs/` is public documentation for customers and developers, including supported CLI, build, architecture, extension, and maintainer contracts. Never publish secrets, private host details, incident procedures, or exploitable VPS mechanics.
- `internal-docs/` is internal documentation for agents and maintainers working on this repository. Document source ownership, implementation topology, filesystem and deployment mechanics, current wiring, incomplete surfaces, operational checks, and shipping procedures.

When behavior changes, update every applicable documentation class in the same change:

- Customer-visible Platform/MCP/API/runtime behavior: update `apps/www/src/content/docs/`.
- CLI/build/map/development behavior: update `internal-docs/`, its non-sensitive public counterpart, and the owning package tests.
- Implementation, ownership, persistence, deployment, or incomplete-wiring changes: update `internal-docs/`.
- Demo behavior: update `demo/README.md`, `demo/docs/index.md`, and `demo/map.mmd`.
- Workspace/user/project structure: update `/root/bapx.in/OKF.md`, `/root/bapx.in/AGENTS.md`, workspace maps, and `apps/www/src/content/docs/okf/`.
- Release-facing changes: update `CHANGELOG.md`.
- Public release, announcement, research, tutorial, or SEO publishing: update YAML-frontmatter Markdown in `apps/www/src/content/blogs/` under exactly one of `announcement`, `release`, `research`, or `tutorials`; follow `internal-docs/blog-publishing.md`.

Before commit, PR, merge, or shipping, inspect the code diff and record which public docs, internal docs, maps, demo docs, and changelog entries changed. If a class is not applicable, state why in the PR validation evidence. Do not leave documentation, maps, or release notes stale after code changes.

## Scheduled Research

`docs/scheduled-research/` is the repository-owned evidence archive for approved recurring research and architecture comparison workflows. It is internal working documentation, not public blog content.

1. Read the complete active `AGENTS.md` chain, `map.mmd`, `README.md`, `CONTRIBUTING.md`, relevant internal/public docs, package manifests, source code, tests, open issues, pull requests, review threads, issue comments, recent commits, and Actions evidence before writing or changing research.
2. Compare the verified repository state only with current official primary sources and official repositories. Record source title, owner, retrieval date, and durable URL in the research document. Separate provider-specific behavior from cross-provider or industry conventions.
3. Search `docs/scheduled-research/`, issues, pull requests, and current implementation before adding a finding. Update the existing record when the same subject already exists; do not create duplicate category files, findings, issues, or design proposals.
4. Write plain Markdown without YAML frontmatter. Each research record must state scope, repository evidence with paths, external evidence, cross-verification status, confirmed gaps, rejected or uncertain hypotheses, issue/PR links, and the next verification step.
5. Treat findings as unconfirmed until repository evidence and at least one applicable authoritative external source agree. For security-sensitive, interoperability, protocol, or provider-compatibility claims, cross-check more than one primary source when available.
6. Create or update a GitHub issue only for a confirmed actionable implementation or documentation gap. Use a clearly labelled design/RFC issue for architecture choices requiring consensus when Discussions are unavailable. Link the research record and include acceptance criteria, tests, documentation, migration, security, and dependency considerations.
7. Read and incorporate material replies from linked issues, pull requests, review threads, and maintainer comments. Record whether feedback confirms, narrows, rejects, supersedes, or completes the finding so future work follows the latest accepted direction precisely.
8. Maintain `docs/scheduled-research/index.md` as the category and status index. When adding a durable category, update the owning source structure and regenerate `map.mmd` with `bapX map --root .`; never hand-edit generated map nodes.
9. Do not commit generated summaries, copied vendor documentation, speculative feature lists, secrets, or unsupported recommendations. Prefer concise evidence and links over duplicated source text.
10. If no new verified evidence exists, do not create a meaningless daily file or touch the repository.

## GitHub Workflow

For meaningful repo changes when GitHub is available:

Follow `CONTRIBUTING.md` for accepted contribution types and repository-specific GitHub policy. Repository maintainers and authorized agents may create implementation branches, commits, and pull requests after the required issue or discussion exists; external contributions follow the intake paths documented there.

1. Diagnose first: inspect or reproduce the behavior and identify affected files and line references.
2. Search existing GitHub issues.
3. Use an existing matching issue or create one with evidence, affected paths, cause, intended scope, and acceptance checks.
4. Branch from the current worktree state without reverting unrelated user changes.
5. Commit only after validation.
6. Create a PR with validation evidence.
7. Merge only when the task requires completing the change end-to-end and repo policy/credentials allow it.

Do not create an issue for read-only diagnosis, trivial questions, or when the user explicitly declines issue tracking.

## Project Map

`map.mmd` is the single repository root map artifact for this repo. Do not add parallel map files or map generators.

Use the CLI map command:

```bash
bapX map --root .
bapX map --root . --check
```

For user projects:

```bash
bapX map --root /root/bapx.in/users/<user>/<business-slug> --check --profile business-workspace
bapX map --root /root/bapx.in/users/<user>/<business-slug>/projects/<project-name-slug> --check --profile user-project
```

For the canonical demo:

```bash
bapX map --root demo --check --profile demo-project
```

Map validation alone is incomplete. For every affected map path, verify the source route/page, package command, generated output, rendered UI, docs navigation, and shared surface that actually implement the behavior.

## Development

Build runtime before CLI or examples:

```
npm run build          # in packages/runtime/
npm run build          # in packages/cli/
```

Type-check runtime changes with:

```
npm run check:types    # in packages/runtime/
```

When using `task` to delegate to subagents, you MUST include a notice that the subagent must not spawn its own subagents.

Treat `review` task feedback as input, not requirements. The primary agent is responsible for deciding whether to act: require a concrete correctness or durability risk within the user's requested scope, supported by a clear failure scenario or violated invariant and relevant `file:line` evidence. Do not accept a reviewer's severity label, proposed fix, or scope expansion at face value, and do not make changes solely to satisfy repeated reviews.

A single `review` task is enough review for most work. Additional reviews are allowed for complex work, but otherwise just spot-check your post-review fixes without doing an entirely fresh review. When performing additional reviews, remember that fresh subagents do not know prior findings/context outside of what the prompt includes; either restate each concern and the relevant expected behavior when asking for confirmation, or ask for an independent scoped review without implying it can confirm prior concerns.

When writing new plans to disk, write them to `plans/` (gitignored intentionally) with a `YYYY-MM-DD` filename prefix.

## Browser and UI Validation

For UI changes:

1. Use the real served page, not only static code inspection.
2. Prefer the in-app browser/browser-control workflow when available.
3. Use Playwright only as fallback or for repeatable regression checks.
4. Verify desktop and mobile-relevant layout, navigation, sign-in/sign-up flows, visible copy, and click behavior.
5. Capture or summarize the exact route, viewport, and visible result in the final/PR validation.

Do not call UI work done when only the Astro build passed.

## CLI and Tooling

The supported CLI, build, API, SDK, runtime, configuration, and developer contracts are public developer documentation and belong on `docs.bapx.in` when they are stable enough to guide implementation. Product customers can use hosted Platform, Agents/Admin-equivalent workspaces, API, MCP, and connectors without installing the CLI, but developers and agents must be able to read the supported CLI/build/API contracts publicly. Keep only private host mechanics, secrets, incident procedures, unreleased operator playbooks, and exploitable operations in `internal-docs/`.

Do not create disconnected tools. New repo operations belong in one of:

- `packages/cli/bin/bapX.ts` for internal bapX operations commands.
- The nearest package `scripts` block for package-local build/test/dev operations.
- `demo/` source and `demo/package.json` scripts for demo-only tools and validation.
- The admin UI/API when the operation is an operator workflow.
- Existing docs/content generation paths when the operation is documentation publishing.

If a temporary script is unavoidable during investigation, remove it or promote it into the owning command surface before finishing.

## Release Readiness

Release work requires an explicit `patch`, `minor`, `major`, or exact version from the user. Treat `v1.1` as exact version `1.1.0`.

Before a v1.1.0 release can be tagged or published:

1. Update `CHANGELOG.md` and docs for the product changes.
2. Validate `map.mmd` and `demo/map.mmd`.
3. Run `npm run build --workspace bapX-demo` and `npm run lint --workspace bapX-demo`.
4. Run the repo build/check commands that are not blocked by pre-existing source breakage.
5. Run browser validation for UI-visible changes.
6. Record blocked checks with exact errors instead of silently skipping them.

Do not publish, tag, or claim release completion while validation is blocked.

## Errors

Throw structured error classes from `packages/runtime/src/errors.ts` rather than ad-hoc `new Error('[bapX] ...')`. If no existing class fits, add one following the structured-constructor pattern: machine-readable fields in `details`, developer-only guidance (filesystem paths, setup mechanics) in `dev` — never in the caller-visible message. Consumers distinguish failures via `instanceof` checks against exported classes and structured fields; error message strings are not API, and tests should assert on class and structured data rather than message text.

## Testing

Use `<package>/test/` for the intentional active suite and `<package>/test-legacy/` for archived tests. Do not add tests to `test-legacy/`, and do not use legacy tests as the source of truth when designing active coverage. Archived tests may remain wired to explicit integration scripts temporarily while equivalent intentional coverage is designed.

Design tests from observable contracts, not implementation structure. Prefer the highest practical public interface: user-facing behavior for public APIs and explicit consumer-facing behavior for stable internal subsystem boundaries. Do not test private helpers directly when their behavior is already exercised through a meaningful interface.

Do not add a regression test for every change. Before adding coverage, ask whether a reasonable suite designed from scratch would intentionally protect this behavior and whether the test is likely to catch a plausible future regression. Prefer tests for durable contracts and meaningful failure modes. Skip tests for incidental implementation details, rare edge cases, and fixes whose corrected form is already the natural result of the surrounding design. Every test makes a behavior harder to change before 1.0, so add one only when that constraint is valuable.

Use `describe('someFunction()')` or `describe('SomeManager')` for the subject under test. Nested `describe()` blocks may name methods or narrower interface states. Name every test with the explicit `it('X when Y')` format so the expected behavior and condition are clear. A reasonable internal refactor should not require test changes unless the observable contract changes.

Prefer explicit, self-contained `it()` blocks over deduplication. Copy-paste in tests is acceptable when it keeps each behavior readable in isolation and makes failures obvious. Avoid `it.each()` unless the cases are genuinely linear and remain clearer as a table. Avoid complex or nested helpers and dynamic test data flow.

Use small fixture helpers only for incidental plumbing that is not under test, such as creating a default environment or initializing a session harness. Do not introduce helpers merely to save a few repeated lines when they construct the subject under test, behavior-relevant inputs, or expected outputs. Keep those values inline in each `it()` block so a reviewer can understand the behavior without following indirection and later edits cannot silently change several tests at once.

Avoid extensive mocking, especially mocks of entire files, packages, or modules. Prefer testing through a real lightweight boundary, a small explicit fake for an injected interface, or a narrow transport fixture. If an existing design makes broad mocking unavoidable, treat that as a design smell: record the cleanup opportunity and document the temporary mock in the test.

When adding or redesigning coverage, create and review behavior stubs before implementing assertions. Do not map old tests one-for-one: retain only behaviors that protect an intentional contract. Do not add tests solely to preserve deprecated behavior, migration guidance, or backwards-compatibility shims unless explicitly requested.

Prefer changes that simplify the system over narrow patches that preserve accidental complexity. When fixing a bug or adding a feature, look for shared abstractions or obsolete branches that can be removed as part of the change, especially when this reduces distinct code paths or semantics. Do not expand into speculative redesign; call out meaningful user-facing behavior or migration tradeoffs before simplifying them away.
