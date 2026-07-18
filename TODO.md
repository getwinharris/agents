# bapX Product Delivery TODO

This file tracks product orchestration in dependency order. A checked item means the behavior is implemented, tested, documented, reviewed, deployed to its stated surface, and browser-validated when user-visible. Planning or static navigation does not count as shipped.

## Stage 0 — Repository and delivery controls

- [x] Define the public/internal documentation split and shipping contract.
- [x] Restore the customer-facing Ecosystem directory and raw Markdown routes.
- [x] Establish account sessions, first user workspace, and first organization creation.
- [x] Adapt the canonical demo conversation into the Admin application.
- [x] Define scheduled-research evidence rules.
- [x] Define environment-aware tool discovery rules.
- [ ] Merge [Issue #31](https://github.com/getwinharris/agents/issues/31) so scheduled research records are discoverable through the generated map.
- [ ] Resolve [Issue #10](https://github.com/getwinharris/agents/issues/10) before publishing npm packages: migrate `@bapX/*` to valid lowercase `@bapx/*` and define legacy environment compatibility.
- [ ] Resolve [Issue #13](https://github.com/getwinharris/agents/issues/13) so operation failures preserve structured operation and reason fields.

## Stage 1 — GitHub URL resolution and Admin project import

Tracking: [Discussion #34](https://github.com/getwinharris/agents/discussions/34), [Issue #35](https://github.com/getwinharris/agents/issues/35)

### Resolver contract

- [ ] Add a focused shared GitHub repository reference module owned by the existing Platform/server implementation.
- [ ] Accept `https://github.com/<owner>/<repo>`, the same URL with `.git`, `ssh://git@github.com/<owner>/<repo>.git`, and `git@github.com:<owner>/<repo>.git`.
- [ ] Normalize supported inputs to canonical owner, repository, HTTPS URL, SSH URL, and project slug fields.
- [ ] Reject embedded HTTP credentials, non-GitHub hosts, missing owner/repository segments, GitHub page URLs such as `/tree/`, `/issues/`, or `/pull/`, query-based ambiguity, encoded traversal, control characters, and invalid slugs.
- [ ] Add contract tests for every accepted and rejected form.

### GitHub authorization and metadata

- [ ] Register or verify the bapX GitHub App configuration and document its callback and webhook ownership without committing secrets.
- [ ] Request only the selected-repository permissions required to read repository metadata and clone contents.
- [ ] Resolve repository ID, default branch, visibility, archived state, owner type, and authenticated clone access through the GitHub API.
- [ ] Store the canonical repository identity and visibility without storing installation tokens or credential-bearing URLs.
- [ ] Return structured authorization, unavailable-repository, archived-repository, rate-limit, and network failures.

### Organization-scoped import

- [ ] Extend the existing Platform store with a workspace-scoped project-import operation rather than creating another data service.
- [ ] Resolve destinations only below the selected organization `projects/` root.
- [ ] Refuse an existing project directory, conflicting project ID, conflicting repository identity, or incompatible existing Git remote without overwriting anything.
- [ ] Clone into a temporary sibling directory and atomically move the verified result into place.
- [ ] Create the required project `index.md`, `docs/index.md`, `docs/map.mmd`, `map.mmd`, collection record, and JSON Schema through the existing OKF/map owners.
- [ ] Preserve repository files, default branch, origin identity, commit SHA, and source visibility metadata.
- [ ] Remove temporary files and revoke short-lived credentials after success or failure.
- [ ] Add integration tests proving path isolation, idempotent failure, cleanup, and visibility preservation.

### Admin proving workflow

- [ ] Replace the Admin Projects zero state with repository URL submission, organization/workspace selection, import progress, structured failure, and success states.
- [ ] Display the canonical GitHub identity and resolved bapX project path before mutation.
- [ ] Require explicit confirmation before importing a private repository or executing a clone.
- [ ] Link a successful import to the existing project file tree/editor.
- [ ] Keep unsupported issue, pull-request, automation, agent, and settings actions visibly unavailable rather than rendering dead controls.
- [ ] Browser-test desktop and mobile Admin flows using a public fixture repository.
- [ ] Browser-test an authorized private fixture without exposing its name, files, URL, or telemetry in public artifacts.

### Telemetry

- [ ] Instrument resolve, authorize, clone, initialize, map validation, registration, and completion as correlated operations through the existing observation and OpenTelemetry packages.
- [ ] Record stable organization, project, repository, commit, operation, duration, state, and error-class fields.
- [ ] Verify snapshots contain no token, cookie, authorization header, prompt, tool arguments, browser profile data, or private file content.
- [ ] Show an Admin import activity record backed by actual telemetry rather than static counters.

### Documentation and shipping

- [ ] Publish supported GitHub URL forms, visibility behavior, project ownership, errors, and customer security expectations on `docs.bapx.in`.
- [ ] Publish non-sensitive resolver, project schema, telemetry, extension, and promotion contracts for external developers.
- [ ] Update restricted operational documentation with GitHub App secret management, deployment, recovery, and verification procedures.
- [ ] Update `map.mmd`, public docs navigation, `CHANGELOG.md`, and applicable demo documentation in the same branch.
- [ ] Verify every affected map path against its owning source files, routes/pages, public and restricted docs, generated output, rendered UI, and navigation; a passing map check alone is insufficient.
- [ ] Run focused tests, npm workspace builds, map checks, dependency/audit checks, and `git diff --check`.
- [x] Verify Codex CLI `0.144.1` accepts `gpt-5.4-mini` and use it in read-only review/orchestration mode until Admin becomes the primary workspace; keep implementation authority and final validation with the owning agent and repository workflow.
- [ ] Create a PR containing exact test, browser, telemetry, documentation, map, dependency, and security evidence.
- [ ] Merge and deploy to Admin only after review passes.

## Stage 2 — GitHub identity and organization onboarding

- [ ] Complete GitHub-only authentication from [Issue #9](https://github.com/getwinharris/agents/issues/9): configured OAuth application, state validation, verified callback handling, collision protection, persistent device sessions, logout, CSRF protection, and rate limiting.
- [ ] Keep GitHub identity authorization separate from GitHub App repository authorization.
- [ ] Create or select the bapX organization before repository selection.
- [ ] List only repositories authorized through the GitHub App installation.
- [ ] Preserve the required user-level OKF workspace even when every initial project comes from GitHub.
- [ ] Browser-test new GitHub signup, existing-account linking, denied organization access, revoked installation, and logout.
- [ ] Document GitHub as the only bapX identity provider; OpenAI and Google remain connectors, not login methods.

## Stage 3 — Repository profile at `bapx.in/<user>/<repo>`

- [ ] Define canonical route resolution, reserved names, redirects, renames, organization collisions, and repository transfer behavior.
- [ ] Enforce public/private visibility on the server before rendering metadata or files.
- [ ] Build the repository-familiar header, project navigation, file tree, README/docs rendering, activity, agents, skills, automations, and settings information architecture from real project data.
- [ ] Use the existing bapX violet design system and official logo; do not clone GitHub branding or source.
- [ ] Provide project search and recent-project navigation inspired by proven repository dashboards.
- [ ] Render explicit shipped, experimental, and unavailable states for every tab.
- [ ] Add keyboard, screen-reader, responsive, empty-state, loading, and error validation.
- [ ] Publish project and extension developer documentation alongside the product behavior.

## Stage 4 — Agent, skill, instruction, hook, and MCP compatibility

- [ ] Inventory repository `AGENTS.md`, `.agents/skills/`, `.github/skills/`, `.github/agents/`, `.github/instructions/`, `.github/prompts/`, hooks, and MCP configuration without modifying imported content.
- [ ] Validate `SKILL.md` frontmatter and referenced resources before activation.
- [ ] Distinguish always-on repository instructions, file-scoped instructions, task skills, role agents, prompts, hooks, and MCP servers in both data and UI.
- [ ] Require review and explicit authorization before running imported scripts, hooks, MCP servers, or high-risk tools.
- [ ] Display compatibility, provenance, permissions, validation results, and activation scope.
- [ ] Add fixtures based on official VS Code-recognized structures and the Agent Skills open standard.
- [ ] Document the supported compatibility subset precisely.
- [ ] Keep the pi-based runtime as the single agent harness; model-provider OAuth and API tokens supply user-authorized inference without creating provider-specific agent runtimes.
- [ ] Register GitHub, CodeRabbit, Supabase, Stripe, Razorpay, Google Workspace, and Vercel CLIs as versioned, health-checked tools behind existing skills and connector permissions.
- [ ] Reuse existing GitHub, Stripe, Supabase, Google Chat, and Vercel Sandbox catalog ownership; add full Google Workspace and Vercel deployment facets only when their real connector operations and pages ship.
- [ ] Consume CodeRabbit `--agent` JSON as review evidence and support an organization-configured self-hosted endpoint without claiming the CodeRabbit engine is bundled with bapX.

## Stage 5 — Automations and scheduled work

- [ ] Implement the existing trigger model: time, recurring schedule, webhook, repository event, connector event, and manual.
- [ ] Model each automation run as a reviewable task with organization, project, agent, prompt/instruction reference, branch/base revision, timezone, status, output, diff, and PR evidence.
- [ ] Support enable/disable without deleting configuration and preserve complete run history.
- [ ] Provide daily, weekday, weekly, interval, and validated cron schedules with explicit timezone and overlap policy.
- [ ] Wire scheduled research through the approved evidence workflow and generated map discovery.
- [ ] Require human approval for publication, deployment, destructive changes, secrets, billing, and permission expansion.
- [ ] Expose actual run history and failure telemetry in Admin before customer promotion.

## Stage 6 — Inbuilt browser and desktop experience

- [ ] Pin Playwright and install its matching Chromium through the owning npm workspace/package lifecycle.
- [ ] Implement one Browser skill that selects Firecrawl for search/scrape/crawl/remote sandbox, Browser Use for fast persistent CDP interaction, and pinned Playwright for deterministic tests/traces; do not create a separate browser or research agent.
- [ ] Pin and health-check Firecrawl CLI, Browser Use CLI, and Playwright CLI through an owning tracked package/runtime lifecycle rather than copying third-party skill files or relying on global, untracked binaries.
- [ ] Normalize Firecrawl accessibility refs (`@e1`) and Browser Use element indices (`[0]`) into typed observations while preserving source adapter and screenshot/trace evidence.
- [ ] Allocate isolated persistent profiles by authorized user/agent context; never reuse a personal Chrome profile implicitly.
- [ ] Implement browser session creation, navigation, tabs, screenshots, downloads, permissions, and teardown as typed bapX tools.
- [ ] Treat all page content as untrusted and expose approval boundaries for authentication, uploads, downloads, payments, publication, and destructive actions.
- [ ] Add browser, terminal, files, review/diff, and mail tabs to Admin only when each has a real backing operation.
- [ ] Record browser operations and artifacts without storing cookies, local storage, credentials, or page secrets in telemetry.
- [ ] Test the hosted Admin browser workflow before designing desktop packaging.
- [ ] Package a separate bapX desktop application with its own Chromium/profile only after the hosted contract is stable.
- [ ] Do not add Desktop Commander.

## Stage 7 — Admin-to-Agents promotion

- [ ] Define a versioned capability manifest shared by Admin and Agents.
- [ ] Require passing tests, Admin browser evidence, structured telemetry, security review, documentation, maps, and rollback evidence for promotion.
- [ ] Deploy the exact shared orchestration version to Agents with customer organization scope; do not copy or fork implementation code.
- [ ] Verify cross-tenant authorization, private repository isolation, organization/project switching, and audit visibility.
- [ ] Publish the release note and update public documentation only after production verification.
- [ ] Keep failed or incomplete capabilities enabled only in Admin and label them experimental.

## Stage 8 — Industrial readiness

- [ ] Add service-level objectives for authentication, repository import, agent operations, automations, and browser sessions.
- [ ] Add backup, restore, migration, retention, deletion, export, and disaster-recovery verification for filesystem collections and project repositories.
- [ ] Add dependency provenance, lockfile policy, secret scanning, push protection, security reporting, and signed release procedures.
- [ ] Add organization roles, least-privilege permissions, audit export, session/device management, and account recovery.
- [ ] Add quotas and concurrency controls for storage, agents, automations, browser sessions, and connector calls.
- [ ] Run accessibility, performance, reliability, threat-model, and tenant-isolation reviews before declaring general availability.

## Evidence sources

- [GitHub Discussions GraphQL API](https://docs.github.com/en/graphql/reference/discussions)
- [GitHub repository visibility](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility)
- [GitHub App repository access](https://docs.github.com/en/apps/using-github-apps/reviewing-and-modifying-installed-github-apps)
- [GitHub OAuth authorization](https://docs.github.com/en/apps/oauth-apps/using-oauth-apps/authorizing-oauth-apps)
- [Capy Automations](https://capy.ai/automations)
- [Capy Security](https://capy.ai/security)
- [Playwright browser management](https://playwright.dev/docs/browsers)
- [Playwright BrowserType](https://playwright.dev/docs/api/class-browsertype)
- [VS Code Agent Skills](https://code.visualstudio.com/docs/agent-customization/agent-skills)
- [VS Code agent customization](https://code.visualstudio.com/docs/agent-customization/overview)
- [OpenTelemetry semantic conventions](https://opentelemetry.io/docs/specs/semconv/)
