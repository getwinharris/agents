# bapX Product Objective

## Objective

bapX is a hosted, organization-scoped operating system for people and agents. A user signs in, creates or joins an organization, creates or imports projects inside that organization, and directs a generic main agent that can use approved tools, skills, automations, browser sessions, repositories, and role-specific agents to complete reviewable work.

The existing pi-based runtime is the agent harness. OpenAI, Codex, Claude, and other model providers are user-authorized model accounts or API-token sources; they do not replace the bapX harness or create separate agent runtimes.

The framework, runtime, demo conversation, filesystem workspace, GitHub channel, maps, OpenTelemetry adapter, Admin, Agents, Platform, and documentation surfaces already exist. Product work must orchestrate these owners into one reliable system rather than build a parallel framework.

## Current shipping deadline

**Deadline: July 21, 2026 at 11:59 PM Asia/Kolkata.**

The current objective is shipped only when an authorized bapX operator can use the existing `admin.bapx.in` Projects surface to submit a supported GitHub repository URL, import it into the correct organization-owned project path, open the resulting project, and verify the real end-to-end flow in a browser with structured success and failure evidence.

Backend primitives, security helpers, workflows, tests, documentation, or review activity do not satisfy the deadline by themselves. Every Engineering and Review run must materially advance this Admin-first vertical slice, remove a demonstrated blocker, or produce concrete validation evidence. Reuse the existing Admin UI, server/API owner, workspace, GitHub capability, project model, runtime, and telemetry implementation; do not create parallel owners.

## Product hierarchy

```text
User
└── Organization / business
    ├── Members and roles
    ├── Credentials, connectors, MCPs, and policies
    └── Projects
        ├── Repository and files
        ├── Main and role-specific agents
        ├── Skills, instructions, prompts, hooks, and tools
        ├── Automations and reviewable runs
        ├── Issues, changes, reviews, and pull requests
        ├── Browser and terminal sessions
        └── Telemetry and audit history
```

Every customer project remains inside:

```text
/root/bapx.in/users/<username>/<organization-slug>/projects/<project-slug>/
```

An imported repository never bypasses the user and organization hierarchy.

## Product surfaces

- `platform.bapx.in` owns identity, organizations, members, projects, storage, billing, GitHub authorization, API keys, connectors, MCP configuration, and cross-project observability.
- `admin.bapx.in` is the bapX-team proving ground. It exercises shared orchestration against `/root/bapx.in` before customer availability.
- `agents.bapx.in` operates a customer organization and its projects through the same shared orchestration with narrower authorization.
- `bapx.in/<user>/<project>` is the planned public or authenticated project-profile alias requested for a GitHub-familiar URL. It does not exist yet. Before implementation, route resolution must define organization selection, duplicate project-name collisions, renames, transfers, reserved names, redirects, and private-project authorization while preserving the canonical organization-owned filesystem path.
- `docs.bapx.in` publishes supported customer behavior and non-sensitive architecture, extension, agent, skill, automation, API, MCP, telemetry, and contribution contracts.

## GitHub adaptation

GitHub is an identity and repository source, not the bapX data model.

1. GitHub OAuth may authenticate or link a user identity.
2. A GitHub App with selected-repository permissions authorizes repository access. Do not request a broad OAuth `repo` scope when narrower GitHub App permissions can satisfy the operation.
3. Supported HTTPS and SSH repository inputs resolve to one canonical `owner/repository` identity before any filesystem or Git operation.
4. GitHub public/private visibility is recorded as the initial bapX project visibility. Private repositories and their contents must never be exposed by a public route.
5. Tokens and credentials never appear in clone URLs, project files, logs, telemetry, or browser-visible responses.
6. Existing project directories, remotes, or identifiers are never overwritten silently.

## Admin-to-Agents promotion

A capability is implemented once behind a workspace-scoped interface.

```text
shared orchestration
        ↓
Admin workspace validation
        ↓ tests, browser evidence, telemetry, review, docs
customer promotion gate
        ↓
Agents organization workspace
```

Admin and Agents may have different authorization scopes and navigation, but they must not fork the core repository, project, agent, automation, browser, or telemetry behavior.

## Agent and workspace compatibility

- `AGENTS.md` is the canonical repository instruction contract.
- Discover portable Agent Skills from recognized `SKILL.md` directories, including `.agents/skills/` and compatible `.github/skills/` locations.
- Represent compatible custom agents, instructions, prompts, hooks, and MCP configuration without converting them into an undocumented bapX-only format.
- Keep repository instructions separate from task-specific skills and role-specific agent configuration.
- Treat external skills, hooks, MCP servers, and agent packages as untrusted until reviewed and authorized.

## Browser objective

The inbuilt browser is an approved bapX tool, not a third-party remote-control dependency.

- Use a pinned Playwright version with its matching Chromium build.
- Use a separate persistent browser profile for each authorized user or isolated agent context.
- Never attach to a personal browser profile implicitly.
- Provide visible navigation, page state, screenshots, downloads, and approval boundaries through the bapX Admin/Agents experience.
- Treat arbitrary page content as untrusted input and preserve tool-call audit evidence.
- Desktop packaging is a later delivery stage after the hosted Admin browser workflow is proven.

One Browser skill owns web research and interactive browser work. Firecrawl supplies search, scrape, crawl, structured retrieval, and an optional remote sandbox when configured; Browser Use supplies fast persistent CDP interaction; the pinned Playwright CLI supplies deterministic browser tests, traces, and repeatable UI validation. Main and role-specific agents may activate this shared skill under policy. Do not create a separate browser or research agent merely to expose these tools.

## CLI capability objective

External CLIs are project-scoped tools invoked through the existing skill and typed-tool runtime, not replacements for the internal bapX CLI or new orchestration systems.

- GitHub CLI owns authorized GitHub issues, pull requests, workflows, releases, and API operations.
- CodeRabbit CLI owns local or self-hosted-endpoint review output; its structured agent output is review evidence, never implementation authority.
- Supabase, Stripe, Razorpay, Google Workspace, and Vercel CLIs expose their provider operations only after the user or organization authorizes the matching connector.
- Each executable is version-pinned, health-checked, permission-scoped, secret-redacted, and reported through the shared capability manifest.
- A service catalog entry and a CLI execution capability are different facets of one integration. Adding a CLI must extend an existing GitHub, Stripe, Supabase, Google, or Vercel integration instead of duplicating it.

## Telemetry and audit objective

Use the existing runtime observation model and `packages/opentelemetry/`. Follow applicable OpenTelemetry HTTP, Git, CI/CD, exception, and GenAI semantic conventions.

Telemetry must correlate organization, project, agent, session, workflow, operation, automation, repository, commit, and deployment identifiers. Record lifecycle state, duration, result, and structured failure classification. Do not record credentials, authorization headers, prompts, system instructions, private file contents, raw tool arguments, or browser storage by default.

## Documentation objective

The product should be understandable and extensible in public.

- Publish stable product behavior and non-sensitive implementation contracts at `docs.bapx.in`.
- Publish project layout, supported repository inputs, extension points, compatibility conventions, telemetry fields, security boundaries, and contribution workflow.
- Keep credentials, incident procedures, private host details, secret rotation, and exploitable VPS mechanics restricted.
- Label every capability as **shipped**, **experimental**, or **planned**. Documentation must never describe a zero state as working.
- Update public docs, restricted operations docs, maps, tests, and `CHANGELOG.md` in the same change as behavior.

## Industrial delivery standard

Every capability follows this path:

1. Verify repository state, relevant issues, pull requests, official sources, and existing owners.
2. Record an approved discussion or issue before implementation.
3. Write observable contract tests before implementation when the behavior is durable.
4. Enforce authorization, isolation, idempotency, structured errors, and secret handling at the shared service boundary.
5. Validate the real Admin workflow in a browser and inspect telemetry.
6. Review code, docs, maps, dependencies, and security implications.
7. Merge and deploy to Admin.
8. Promote the same reviewed implementation to Agents only when the promotion gate passes.
9. Record exactly what shipped and what remains planned.

## Current delivery decision

The first objective is [Discussion #34](https://github.com/getwinharris/agents/discussions/34) and [Issue #35](https://github.com/getwinharris/agents/issues/35): resolve GitHub repository URLs and import repositories into organization-owned projects through Admin with structured telemetry. GitHub signup, the full repository profile UI, the packaged browser, and Agents promotion remain later gated stages.
