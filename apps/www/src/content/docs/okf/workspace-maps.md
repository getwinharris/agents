---
title: Workspace Maps
description: How bapX stores generated map.mmd files for user, business, and project workspaces.
---

`map.mmd` is the structural map file used by bapX admin, agents, and MCP-facing tooling to understand a workspace without guessing. It is Mermaid source, kept next to the files it describes, and generated from the actual filesystem/source layout.

Maps are semantic indexes, not decorative diagrams. They help agents answer practical questions before editing: which app owns this route, where is the API implemented, which docs are public, which files are generated, and where should a new capability be wired so it is not duplicated.

## Required locations

- `/root/bapx.in/map.mmd` maps the VPS workspace root.
- `/root/bapx.in/project-packages-git/agents/map.mmd` maps the agents project root.
- `root-sandbox/<user>/map.mmd` maps each user git workspace in public docs.
- `root-sandbox/<user>/<business-slug>/map.mmd` maps each business workspace in public docs.
- Every project inside a business workspace must include its own `docs/`, `docs/map.mmd`, and `map.mmd`.

`root-sandbox/` is the customer-facing workspace boundary. The server-owned storage path is internal implementation detail; agents and public docs should use the `root-sandbox/` vocabulary when explaining customer workspaces.

## Agents project map

The agents project map is generated from the real repository layout:

```bash
cd /root/bapx.in/project-packages-git/agents
npm run build --workspace /cli
node packages/cli/dist/bapX.js map --root .
node packages/cli/dist/bapX.js map --root . --check
```

When the CLI is installed, use `bapX map --root <project>` and `bapX map --root <project> --check`. This is a supported developer contract, not an internal-only secret.

Run this after adding, moving, or removing top-level project structure such as `apps/`, `packages/`, `examples/`, `demo/`, `projects/`, `docs/`, `src/`, `agents/`, `workflows/`, `assets/`, `blueprints/`, `skills/`, or scripts. Do not hand-edit the generated file.

## Canonical demo

The canonical product demo lives at `/root/bapx.in/project-packages-git/agents/demo/`.

It owns its own OKF and map contract:

- `demo/OKF.md`
- `demo/map.mmd`
- `demo/docs/index.md`

Validate it with:

```bash
bapX map --root /root/bapx.in/project-packages-git/agents/demo --check --profile demo-project
npm run build --workspace bapX-demo
npm run lint --workspace bapX-demo
```

Do not copy the demo into `root-sandbox/demo`. Real user workspaces are separate git repositories represented publicly under `root-sandbox/<user>/`; demo imports happen inside real business projects.

## User workspaces

When creating or repairing a real customer workspace, the folder must be built from the canonical sources:

1. Copy the canonical OKF profile to `root-sandbox/<user>/OKF.md`.
2. Add `root-sandbox/<user>/index.yaml`.
3. Add `root-sandbox/<user>/map.mmd`.
4. Add one business folder at `root-sandbox/<user>/<business-slug>/` when onboarding a real business.
5. Do not create `root-sandbox/demo`.

Canonical demo and example sources stay in the agents repo:

- `/root/bapx.in/project-packages-git/agents/demo/`
- `/root/bapx.in/project-packages-git/agents/examples/`

Verify the result with:

```bash
test -f root-sandbox/<user>/OKF.md
test -f root-sandbox/<user>/map.mmd
test -d root-sandbox/<user>/<business-slug>
```

## Business workspaces

Each user workspace is represented publicly as a git repository at `root-sandbox/<user>/`. Business workspaces live under `root-sandbox/<user>/<business-slug>/`.

Each business must include:

- `index.yaml`, describing brand, logo, project, and map files.
- `map.mmd`, generated and checked with `bapX map --root <business> --profile business-workspace`.
- `DESIGN.md`, containing the design principles and brand identity captured during setup.
- `brand.css`, containing the business-level brand variables.
- `logos/index.yaml` and `logos/map.mmd`.
- `projects/index.yaml` and `projects/map.mmd`.

Validate required business files with:

```bash
bapX map --root root-sandbox/<user>/<business-slug> --check --profile business-workspace
```

## User projects

User-managed projects live under `root-sandbox/<user>/<business-slug>/projects/<project-name-slug>/`.

Each project must include:

- `map.mmd`, generated and checked with `bapX map --root <project>`.
- `docs/`, with at least `docs/index.yaml` and `docs/map.mmd` for project-specific documentation.
- `index.yaml`, describing `map.mmd`, `docs/`, and the main project entry points.

Validate required user-project files with:

```bash
bapX map --root root-sandbox/<user>/<business-slug>/projects/<project-name-slug> --check --profile user-project
```

Agent project maps should extract the structure that matters for operations: folders, functions, classes, tool calls, workflows, connections, and known gaps. Agent projects should also include the source layout they use, such as `.agents/agents/`, `.agents/workflows/`, or the bare `agents/` and `workflows/` folders when `.agents/` is not present.

## Skill and automation layout

Repository-native agent skills belong under `.agents/skills/<skill-name>/SKILL.md`. Imported or legacy skill folders from `.opencode/skills`, `.claude/skills`, or similar agent-specific locations should be normalized into `.agents/skills` when the repository intends bapX agents and automation to discover them. Keep provider-specific config outside the skill body unless the skill is genuinely tied to that provider.

## Markdown frontmatter

Project docs should use YAML frontmatter. For project overview docs, use this shape unless a local docs schema requires more specific fields:

```md
---
type: concept
title: Project Overview
description: A brief introduction to local files
timestamp: 2026-07-10T20:14:00Z
---
```

Existing docs pages such as API references may use their established `title`, `description`, and `lastReviewedAt` schema. Do not remove valid local schema fields just to make every document identical.
