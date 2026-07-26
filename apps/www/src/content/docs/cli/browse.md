---
title: Browse
description: Use the wrapped agent-browser CLI through bapX with isolated browser sessions.
lastReviewedAt: 2026-07-26
---

`bapX browse` wraps the real [`agent-browser`](https://github.com/vercel-labs/agent-browser) command instead of exposing a browser MCP. Use it when a coding agent, operator, or CI check needs to exercise a live product page the way a user would: open, click, fill, inspect snapshots, collect browser errors, and capture screenshots.

The wrapper always supplies a bapX-scoped browser session and namespace. By default those values are derived from the current root plus `BAPX_BROWSER_USER`, `BAPX_BROWSER_BUSINESS`, `BAPX_BROWSER_PROJECT`, and `BAPX_BROWSER_ACTOR` when present, so browser state can be separated by user, business, project, and agent. You can override the scope explicitly:

```bash
npx bapX browse --root . --session auth-smoke --namespace bapx-auth -- open https://bapx.in/
npx bapX browse --root . --session auth-smoke --namespace bapx-auth -- snapshot -i
```

For quick production smoke checks, use `verify`:

```bash
npx bapX browse verify https://bapx.in/
```

`verify` opens the URL, waits for network idle, checks that the page has content, records browser errors, writes a screenshot under `.bapx/browser/evidence/`, prints an interactive snapshot, and closes the browser session.

This command is intentionally a CLI boundary. Users may still install MCP servers inside their own sandbox when a project requires MCP, but bapX's own browser automation uses the self-hosted CLI path.
