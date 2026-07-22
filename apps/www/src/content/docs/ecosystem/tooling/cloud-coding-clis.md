---
title: Cloud coding CLIs
description: VPS-hosted coding-agent CLIs exposed through bapX skills, tools, comments, and automations.
lastReviewedAt: 2026-07-22
---

bapX may expose selected coding-agent CLIs as self-hosted tools inside the existing PI/Bapx harness. These tools do not replace the bapX runtime. They are invoked by the central bapX agent or role-specific agents inside an approved project sandbox.

Planned hosted tools include Codex, Claude Code, OpenCode, Zed or Zcode workflows, Kimi Code, Antigravity CLI, GitHub Copilot CLI, Kilo Code, Roo Code, Cline-style tools, and small MCP agents such as Null Claw when they pass security and capability review.

## Product contract

- Each CLI is version-pinned, health-checked, permission-scoped, and secret-redacted.
- Work runs in a project-specific sandbox, not on a personal machine profile.
- Comments, issue updates, PR changes, deployments, billing mutations, permission changes, and destructive actions require policy and human approval.
- Outputs are review evidence for the central bapX agent, not independent authority.
- Telemetry must correlate the organisation, project, task, agent, CLI, sandbox, commit, and approval state.

This is the path for Capy/Linear-style comments and automations: the central bapX agent coordinates the work, specialist tools contribute evidence, and the shared Admin/Agents surface keeps the task, artifact, comment, audit, and approval trail together.
