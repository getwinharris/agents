---
title: OpenSandbox
description: Planned OpenSandbox adapter for per-user and per-project sandbox isolation.
lastReviewedAt: 2026-07-22
---

OpenSandbox is being evaluated as a remote sandbox adapter for user-specific and project-specific isolation.

The official OpenSandbox project describes a unified sandbox API with Docker and Kubernetes runtime options for coding agents, GUI agents, code execution, and evaluation workflows. bapX would use it only through the existing Sandbox Adapter API and the PI/Bapx harness.

## Planned evaluation

- Verify Docker and Kubernetes runtime isolation against bapX tenant boundaries.
- Map file, command, process, network, timeout, and teardown behavior to the bapX Sandbox Adapter API.
- Define per-user and per-project sandbox identity, retention, quota, and approval policy.
- Ensure credentials are injected by policy and never written to workspace files, logs, telemetry, or model context.
- Compare against existing Cloudflare Sandbox, Daytona, E2B, Modal, and Vercel Sandbox options before promotion.
