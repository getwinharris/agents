# Product documentation standards comparison

## Scope

This record compares the current bapX documentation/product surface with the user-requested references: ReadMe, Multica, the Model Context Protocol documentation, and the local OKF/map contracts. Retrieval date: 2026-07-22.

## External evidence

- ReadMe’s public docs expose a clear top-level IA: Guides, Recipes, API Reference, Changelog, and Discussions. The pages also tell AI agents to use `https://docs.readme.com/main/llms.txt` for Markdown/OpenAPI discovery.
- ReadMe’s API Reference documents endpoints for API keys, pages, APIs, branches, categories, changelog, and more instead of hiding API contracts.
- ReadMe’s Changelog is public and dated, with recent entries including MCP server authentication and agent upgrades.
- Multica positions the product as project management for human + agent teams. Its product page shows agents assigned like teammates, reporting status, opening/commenting on issues, and appearing in the same activity feed as humans.
- Multica’s docs include workspace/team, projects/issues/comments, agents, skills, squads, runtime/provider matrix, tasks, chat/autopilots, integrations/channels, self-hosting ops, CLI reference, desktop app, and mobile app.
- The Model Context Protocol documentation describes MCP as an open standard that connects AI applications to tools, data sources, and workflows. The 2025-06-18 specification covers base protocol, authorization, client features, prompts, resources, tools, and security/trust guidance.

## Repository evidence

- Public docs now include CLI, API, SDK, runtime, configuration, deployment, MCP, OKF, ecosystem, and platform pages under `apps/www/src/content/docs/`.
- `apps/www/src/pages/pricing.astro` was missing before this audit; that made `https://bapx.in/pricing/` return 404 in production.
- `apps/www/src/pages/products.astro` linked to stale docs routes `/channels/` and `/sandboxes/`; the actual docs routes are `/guide/channels/` and `/guide/sandboxes/`.
- The production worktree at `/root/bapx.in/project-packages-git/agents-production` was still on `ef8c23f2`, while current source had later corrections. This explains live `15+ years` and missing docs/pricing routes.
- Repository skills existed in `.opencode/skills/` as well as `.agents/skills/`; bapX discovery should use `.agents/skills/`.
- Public MCP docs existed but were too thin and implied `api.bapx.in/mcp` more strongly than the implementation currently proves.
- Public OKF/map docs existed but did not fully explain the semantic-index role of `map.mmd` for agents, MCP clients, and automation.

## Confirmed gaps

1. Deploy source corrections to production so `bapx.in`, `docs.bapx.in`, `platform.bapx.in`, `agents.bapx.in`, and `admin.bapx.in` reflect the current build.
2. Keep public supported CLI/build/API/SDK/runtime/developer contracts on `docs.bapx.in`; restrict only secrets, private host mechanics, incident response, and unshipped operator playbooks.
3. Finish Razorpay subscription implementation before claiming live payment mutations.
4. Implement and browser-validate the authenticated MCP gateway before claiming external MCP clients can manage bapX.
5. Continue Admin/Agents cockpit work toward the Multica/Capy/Copilot pattern: central bapX agent, assignable specialists, issues, PRs, automations, comments, status, blockers, and audit timelines.
6. Maintain `.agents/skills/` as the canonical repo skill folder and avoid parallel untracked skill locations.

## Rejected or uncertain hypotheses

- “Public CLI docs are wrong” is rejected. ReadMe and Multica both document developer/CLI/API surfaces publicly. bapX should do the same for supported contracts.
- “MCP is shipped because a docs page exists” is rejected. The public endpoint, auth, tools/resources/prompt registry, and approvals need implementation evidence.
- “Razorpay is shipped because pricing mentions it” is rejected. Pricing can state Razorpay is the planned INR billing owner, but live payment flow needs server-side verification and tests.

## Next verification step

After deployment, run route checks against live hosts and create focused GitHub issues for any remaining confirmed gap that is not solved in the deployment commit.
