---
title: Browse
description: Use the bapX AgentBrowser Linux runtime or the explicit Vercel fallback through scoped browser sessions.
lastReviewedAt: 2026-08-20
---

`bapX browse` wraps [`bapXai/AgentBrowser`](https://github.com/bapXai/AgentBrowser) as the default browser-agent backend instead of exposing a browser MCP. AgentBrowser provides task-space isolation and a Playwright-style JavaScript facade over its `ego-browser` command. The browser runtime uses Chromium, so this changes the agent/runtime contract; it does not replace the Chromium rendering engine.

The MIT-licensed bapX fork includes an open Linux host that launches an installed Chrome/Chromium browser over CDP. The separately distributed macOS app can still supply its embedded host, but its application source is not included in the repository. The Linux host does not claim parity for desktop-profile migration, kernel-customized snapshots, cross-process task-space persistence, or GUI handoff. Vercel's pinned [`agent-browser`](https://github.com/vercel-labs/agent-browser) remains an explicit `--engine vercel` fallback.

The wrapper always supplies a bapX-scoped browser session and namespace. By default those values are derived from the current root plus `BAPX_BROWSER_USER`, `BAPX_BROWSER_BUSINESS`, `BAPX_BROWSER_PROJECT`, and `BAPX_BROWSER_ACTOR` when present. Linux profiles are stored with owner-only permissions under `.agents/browser/profiles/<namespace>/<session>/`; another user, project, or agent scope receives a different profile path. Never override that path with a shared desktop profile. You can override the logical scope explicitly:

```bash
npx bapX browse --engine agentbrowser --root . --session auth-smoke --namespace bapx-auth -- nodejs
npx bapX browse --engine vercel --root . --session auth-smoke --namespace bapx-auth -- open https://bapx.in/
npx bapX browse --engine vercel --root . --session auth-smoke --namespace bapx-auth -- snapshot -i
```

AgentBrowser reads JavaScript from standard input. For interactive AgentBrowser work, pipe or provide the `ego-browser nodejs` script contract. `bapX` passes the scoped session and namespace in `BAPX_BROWSER_SESSION` and `BAPX_BROWSER_NAMESPACE`, and the isolated Linux profile in `EGO_BROWSER_PROFILE_DIR`; the script must select a task space before manipulating pages. Keep a Linux task in one script because the current host does not preserve task-space processes between separate commands.

For quick production smoke checks, use `verify`:

```bash
npx bapX browse verify https://bapx.in/
npx bapX browse --engine vercel verify https://bapx.in/
```

With the default AgentBrowser engine, `verify` creates a fresh task space under the scoped session name, opens the URL, enables browser error events, reloads and waits for the document, rejects a blank page, reports browser errors, captures a page snapshot and full-page screenshot, then closes only that verification task space. It never reuses or closes a human-controlled task space. With `--engine vercel`, it runs the existing open, network-idle, content, browser-error, screenshot, snapshot, and close sequence. Both engines write screenshots under `.agents/browser/evidence/`.

This command is intentionally a CLI boundary. Users may still install MCP servers inside their own sandbox when a project requires MCP, but bapX's own browser automation uses the self-hosted CLI path. AgentBrowser does not own bapX accounts, API credits, billing, or endpoint authorization; the platform layer must enforce those boundaries separately.
