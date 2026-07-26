---
title: bapXsandbox
description: Planned bapXsandbox adapter based on OpenSandbox-style isolation for per-user and per-project workspaces.
lastReviewedAt: 2026-07-26
---

bapXsandbox is the bapX product name for the planned OpenSandbox-style remote sandbox adapter for user-specific and project-specific isolation.

The upstream OpenSandbox project describes a unified sandbox API with Docker and Kubernetes runtime options for coding agents, GUI agents, code execution, and evaluation workflows. bapX would expose that capability as bapXsandbox only through the existing Sandbox Adapter API and the PI/Bapx harness.

## Planned evaluation

- Verify Docker and Kubernetes runtime isolation against bapX tenant boundaries.
- Map file, command, process, network, timeout, and teardown behavior to the bapX Sandbox Adapter API.
- Define per-user and per-project sandbox identity, retention, quota, and approval policy.
- Ensure credentials are injected by policy and never written to workspace files, logs, telemetry, or model context.
- Compare against existing Cloudflare Sandbox, Daytona, E2B, Modal, and Vercel Sandbox options before promotion.
