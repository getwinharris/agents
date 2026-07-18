# Repository agent conventions

Status: Verified baseline
Category: Agent standards
Last verified: 2026-07-18
Primary tracking issue: #31

## Scope

Identify the established repository-level instruction and portable agent-skill conventions that bapX should adopt directly before considering any bapX-specific extension.

## Repository evidence

- `AGENTS.md` is the binding repository work contract and requires source-grounded changes.
- `.agents/skills/` already exists in this repository and contains reusable `SKILL.md` packages.
- `map.mmd` already recognises `.agents` as a top-level repository subsystem.
- `packages/cli/bin/bapX.ts` owns the single `bapX map` implementation and must remain the only map generator.

## Official external evidence

### Microsoft — Use Agent Skills in VS Code

Retrieved: 2026-07-18
Source: https://code.visualstudio.com/docs/agent-customization/agent-skills

VS Code documents Agent Skills as an open standard and recognises project skills in `.agents/skills/`, `.github/skills/`, and `.claude/skills/`. A skill is a directory containing `SKILL.md` plus optional scripts and references.

### Microsoft — Agents in VS Code

Retrieved: 2026-07-18
Source: https://code.visualstudio.com/docs/agents/concepts/agents

VS Code separates custom agents, Agent Skills, and lifecycle hooks as distinct customization mechanisms. Custom agents can define instructions, tools, and a language model; skills provide reusable capabilities; hooks run commands at lifecycle points.

### Microsoft — Custom agents in VS Code

Retrieved: 2026-07-18
Source: https://code.visualstudio.com/docs/agent-customization/custom-agents

VS Code custom agents use `.agent.md` files and support reuse across local, background, and cloud agent sessions. The default discovery location remains vendor-specific and configurable.

## Cross-verification status

Confirmed:

- `AGENTS.md` is an established repository instruction convention and is already the bapX repository contract.
- `.agents/skills/<name>/SKILL.md` is an officially supported portable Agent Skills location and already matches the repository.
- Skills, custom agents, and hooks are separate concepts in current agent tooling.

Not established as one cross-vendor standard:

- A universal `.agents/agents/` location for role-specific agents.
- A universal `.agents/hooks/` event schema.
- A universal `.agents/workflows/` file format.

bapX must not invent those formats merely for symmetry. It should adopt an existing standard when one is established or add only the minimum hosted capability required by a verified product need.

## Confirmed bapX opportunity

Make existing research and standards records discoverable through the repository's generated `map.mmd`. This requires extending the current map generator only for the `docs/scheduled-research/` Markdown tree, without creating another map system.

## Rejected or uncertain hypotheses

- Rejected: Treat every folder under `.agents/` as an already standardised cross-vendor contract.
- Rejected: Copy `.claude/` or `.github/` naming into bapX without checking portability.
- Uncertain: Whether hooks and role-specific agents will converge on `.agents/` locations. Continue monitoring official standards before adopting a native format.

## Linked work

- Issue #31 — index scheduled research documents in the generated repository map.

## Next verification step

After issue #31 is implemented, verify that `bapX map --root .` includes this file and its category in `map.mmd`, and that `bapX map --root . --check` detects stale research map entries.
