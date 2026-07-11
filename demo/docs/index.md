---
type: concept
title: bapX Demo Project
description: A brief introduction to the canonical bapX demo files.
timestamp: 2026-07-10T20:14:00Z
---

# bapX Demo Project

This is the canonical bapX demo app. It is not a user workspace and must not be copied into `users/demo`.

## Canonical Files

- [OKF.md](../OKF.md) - Open Knowledge Format reference copied from `/root/bapx.in/OKF.md`.
- [map.mmd](../map.mmd) - Generated project map for the demo app.
- [docs/map.mmd](./map.mmd) - Generated docs folder map.
- [README.md](../README.md) - Runbook for starting the demo against a bapX dev server.

## Source Ownership

- `src/lib/bapX-client.ts` owns URL parsing and SDK client creation.
- `src/state/` owns local UI state and preferences.
- `src/components/` owns the chat shell and controls.
- `src/styles/` owns demo styling.

## Validation

Run these before using the demo as release evidence:

```sh
npm run build --workspace bapX-demo
npm run lint --workspace bapX-demo
bapX map --root demo --check --profile demo-project
```
