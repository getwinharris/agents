---
title: Workspace Maps
description: How bapX stores generated map.mmd files for user, business, and project workspaces.
---

`map.mmd` is the structural map file used by bapX admin and agent surfaces to understand a workspace without guessing. It is Mermaid source, kept next to the files it describes.

## Required locations

- `/root/bapx.in/map.mmd` maps the VPS workspace root.
- `/root/bapx.in/project-packages-git/agents/map.mmd` maps the agents project root.
- `/root/bapx.in/users/<user>/map.mmd` maps each user git workspace.
- `/root/bapx.in/users/<user>/<business-slug>/map.mmd` maps each business workspace.
- Every project inside a business workspace must include its own `docs/`, `docs/map.mmd`, and `map.mmd`.

## Agents project map

The agents project map is generated from the real repository layout:

```bash
cd /root/bapx.in/project-packages-git/agents
npm run build --workspace /cli
node packages/cli/dist/bapX.js map --root .
node packages/cli/dist/bapX.js map --root . --check
```

When the CLI is installed, use `bapX map --root <project>` and `bapX map --root <project> --check`.

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

Do not copy the demo into `users/demo`. Real user workspaces are separate git repositories under `users/<user>/`; demo imports happen inside real business projects.

## User workspaces

When creating or repairing a real `users/<user>/`, the folder must be built from the canonical sources:

1. Copy `/root/bapx.in/OKF.md` to `users/<user>/OKF.md` exactly.
2. Add `users/<user>/index.md`.
3. Add `users/<user>/map.mmd`.
4. Add one business folder at `users/<user>/<business-slug>/` when onboarding a real business.
5. Do not create `users/demo`.

Canonical demo and example sources stay in the agents repo:

- `/root/bapx.in/project-packages-git/agents/demo/`
- `/root/bapx.in/project-packages-git/agents/examples/`

Verify the result with:

```bash
cmp -s /root/bapx.in/OKF.md /root/bapx.in/users/<user>/OKF.md
test -f /root/bapx.in/users/<user>/map.mmd
test -d /root/bapx.in/users/<user>/<business-slug>
```

## Business workspaces

Each user workspace is a git repository at `/root/bapx.in/users/<user>/`. Business workspaces live under `/root/bapx.in/users/<user>/<business-slug>/`.

Each business must include:

- `index.md`, linking to brand, logo, project, and map files.
- `map.mmd`, generated and checked with `bapX map --root <business> --profile business-workspace`.
- `DESIGN.md`, containing the design principles and brand identity captured during setup.
- `brand.css`, containing the business-level brand variables.
- `logos/index.md` and `logos/map.mmd`.
- `projects/index.md` and `projects/map.mmd`.

Validate required business files with:

```bash
bapX map --root /root/bapx.in/users/<user>/<business-slug> --check --profile business-workspace
```

## User projects

User-managed projects live under `/root/bapx.in/users/<user>/<business-slug>/projects/<project-name-slug>/`.

Each project must include:

- `map.mmd`, generated and checked with `bapX map --root <project>`.
- `docs/`, with at least `docs/index.md` and `docs/map.mmd` for project-specific documentation.
- `index.md`, linking to `map.mmd`, `docs/`, and the main project entry points.

Validate required user-project files with:

```bash
bapX map --root /root/bapx.in/users/<user>/<business-slug>/projects/<project-name-slug> --check --profile user-project
```

Agent project maps should extract the structure that matters for operations: folders, functions, classes, tool calls, workflows, connections, and known gaps. Agent projects should also include the source layout they use, such as `.bapX/agents/`, `.bapX/workflows/`, or the bare `agents/` and `workflows/` folders when `.bapX/` is not present.

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
