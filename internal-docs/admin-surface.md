# Admin operating surface

## Product role

`admin.bapx.in` is the bapX business operating surface. Its workspace root is `/root/bapx.in`. It uses the same operating model that customers receive at `agents.bapx.in`, with bapX-wide scope.

The canonical `demo/` is the functional source for the agent conversation experience. It already owns the SDK/React integration, streaming messages, reasoning, tools, subagent display, conversation history, connection settings, and responsive sidebar. Do not replace that behavior with static Astro chat markup.

## Integration contract

- Keep `demo/` independently runnable as the canonical product harness and reference implementation.
- `apps/www/admin/` is the explicitly requested source copy adapted for the Admin subdomain. It remains an npm workspace and builds through the owning `apps-www` build into `apps/www/dist/admin/`.
- Do not copy `demo/dist`, commit generated Admin output, or create another Admin application.
- Port relevant canonical demo chat/runtime corrections into the Admin copy deliberately; Admin-specific navigation, workspace scope, authentication, and theme remain owned by `apps/www/admin/`.
- Preserve the existing admin workspace file tree/editor and expose it through Projects rather than deleting it.
- The primary view must be a working conversation with the configured main bapX agent, not a decorative dashboard or fake chat.
- The Admin server provides SPA fallback for operational routes and keeps `/api/ws/*` scoped to `/root/bapx.in`.

## Navigation

The left navigation follows the canonical demo/sidebar interaction and includes:

1. **New task** — starts a main-agent conversation.
2. **Automations** — replaces Scheduled/Schedules and includes time, recurring schedule, webhook, repository-event, connector-event, and manual triggers.
3. **MCPs** — business-owned Model Context Protocol connections, servers, tools, access, and credentials.
4. **Projects** — replaces Sites and exposes workspace projects, repositories, files, maps, previews, and changes rooted at `/root/bapx.in`.
5. **Team** — bapX people, roles, permissions, assignments, and human coordination.
6. **Agents** — main and role-specific agents, including their tools, responsibilities, availability, and work.
7. **Pull requests** — repository review and delivery work.
8. **Chat** — conversations and coordination views.

The project list remains visible below the main navigation, matching the supplied reference structure.

## First implementation boundary

The first implementation may expose Projects, Team, Agents, Automations, MCPs, Pull requests, and Chat as navigable zero states only when their backing operations do not yet exist. Every such surface must label the actual state and must not present dead controls as working. Main-agent chat and the existing workspace file API/editor are the first real capabilities to preserve and connect.

## Platform dependency

`platform.bapx.in` is not complete. Admin integration must not imply that OAuth, billing, key management, connectors, MCP configuration, project creation, real metrics, or observability are working until those operations are implemented and browser-validated.
