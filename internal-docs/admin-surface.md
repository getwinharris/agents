# Admin operating surface

## Product role

`admin.bapx.in` is the bapX business operating surface. Its workspace root is `/root/bapx.in`. It uses the same operating model that customers receive at `agents.bapx.in`, with bapX-wide scope.

The canonical `demo/` is the functional source for the agent conversation experience. It already owns the SDK/React integration, streaming messages, reasoning, tools, subagent display, conversation history, connection settings, and responsive sidebar. Do not replace that behavior with static Astro chat markup.

The supplied Capy/GitHub Copilot screenshots and the verified Multica product direction define the operating pattern: bapX needs a working cockpit, not a static dashboard. The center of the product is the bapX agent composer with project/branch context, model and specialist-agent selection, recent work, task/PR/automation navigation, and human/agent status visible in one workspace. Reference products show agents assigned to issues like teammates, reporting blockers and progress in the same activity stream as humans, and coordinating squads through reusable skills and hosted coding/browser tools. Implement those patterns through the existing bapX/PI harness and canonical demo/Admin owners; do not create a second runtime or decorative clone.

## Integration contract

- Keep `demo/` independently runnable as the canonical product harness and reference implementation.
- `apps/www/admin/` is the explicitly requested source copy adapted for the Admin subdomain. It remains an npm workspace and builds through the owning `apps-www` build into `apps/www/dist/admin/`.
- Do not copy `demo/dist`, commit generated Admin output, or create another Admin application.
- Port relevant canonical demo chat/runtime corrections into the Admin copy deliberately; Admin-specific navigation, workspace scope, authentication, and theme remain owned by `apps/www/admin/`.
- Preserve the existing admin workspace file tree/editor and expose it through Projects rather than deleting it.
- The primary view must be a working conversation with the configured main bapX agent, not a decorative dashboard or fake chat.
- The Admin server provides SPA fallback for operational routes and keeps `/api/ws/*` scoped to `/root/bapx.in`.
- `apps/agents-runtime/` owns the production `main` agent protocol. Browsers call the same-origin `/api/agents/main/:id` route; `apps/www/server.mjs` authenticates the bapX session, adds the account identity and private runtime token, and streams the response from the loopback runtime. Do not expose the runtime port through Traefik.
- The customer hostname serves this same React shell but hides Admin-only pull-request navigation and roots `/api/ws/*` at `users/<username>/workspace`. Path traversal is rejected after resolving against that customer root.
- The checked-in main agent is a deterministic bootstrap model that exercises streamed reasoning, a safe workspace-status tool, tool results, and final text without a provider secret. Platform-owned provider selection can replace that model; do not put customer provider credentials in the web bundle or proxy configuration.

## Admin API authorization boundary

The existing provider-ID authorization owner in `apps/www/src/server/admin-authorization.mjs` is the single authorization policy for protected Admin HTTP APIs. `apps/www/server.mjs` applies that policy before dispatching any Admin request to the shared agent gateway, workspace tree/editor API, project import API, or Admin content API.

- A missing bapX session returns `401` with `authentication_required` before any protected handler or runtime proxy is reached.
- An authenticated account without an exact GitHub provider ID listed in `BAPX_ADMIN_GITHUB_USER_IDS` returns `403` with `admin_forbidden`.
- Cookie-authenticated Admin mutations require the exact `https://admin.bapx.in` origin. Missing, foreign, malformed, HTTP, and lookalike origins return `403` with `cross_origin_forbidden`.
- Protected handlers do not emit wildcard CORS headers. Browser access is same-origin by default.
- Admin workspace reads and writes resolve against the explicit server-owned `/root/bapx.in` root. Customer workspace routing remains separately scoped to `users/<username>/workspace` and continues to require the existing customer session.
- The Admin agent gateway reuses the same authorization decision before forwarding the account identity and private runtime token. Customer `agents.bapx.in` behavior remains session-authenticated and is not promoted to bapX-wide authority.
- This boundary does not create another session, cookie, CSRF token store, runtime, or frontend. The existing session, provider-ID authorization, workspace, content, project-import, and runtime owners remain authoritative.
- Changing `apps/www/server.mjs` requires rebuilding and restarting the existing `apps-www` service. After synchronization, verify anonymous and non-Admin denials, authorized tree/read/write, authorized agent streaming, same-origin content mutation, missing- and foreign-origin rejection, public-route regression checks, and absence of credentials or private paths in responses and logs.

## Admin Projects import

The first working Projects slice reuses the existing Admin React application, existing workspace editor, canonical GitHub repository resolver, existing platform session, and existing Admin provider-ID authorization owner.

- `/projects` owns repository URL submission, server-authorized resolution, explicit project-slug selection, canonical repository and destination preview before mutation, confirmation, progress, structured errors, imported-project listing, and links into `/editor/`.
- `POST /api/projects/resolve` is part of the existing protected Projects route family. It normalizes the submitted GitHub reference, obtains metadata-only GitHub App installation authorization, resolves canonical GitHub casing, repository ID, owner type, default branch, visibility and archived state, and returns a suggested `projects/<owner-repository>` destination without filesystem or Git mutation.
- Changing the repository input invalidates the previous resolution and confirmation. The browser enables destination editing and import confirmation only after a successful server response, so client-side URL guessing is not treated as canonical evidence.
- Progress, success, and failure are distinct browser states on the existing Projects form. Progress and success use polite status announcements; failures use an assertive alert. The rendered state is also exposed as `data-state` for deterministic browser validation without parsing message copy.
- The imported-projects panel distinguishes listing progress, listing failure, a confirmed empty workspace, and a populated result. It exposes `aria-busy` while loading, uses a polite status for loading, an alert for listing failure, and deterministic `data-state="loading|error|empty|ready"` values. The empty message must not render before the listing request settles.
- Import completion and project-list refresh are separate outcomes. Once `POST /api/projects/import` succeeds, the form keeps the structured success state even if the follow-up `GET /api/projects` refresh fails; that refresh failure appears only in the imported-projects panel so operators are not told to retry an import that already mutated the workspace.
- `GET /api/projects` lists directories below `/root/bapx.in/projects/` and reads only the private `.bapx-project.json` metadata written by the import owner. Completed imports preserve their operation ID, completion status, and verified commit in this listing. Each imported-project card renders all three values after reload, rather than relying only on transient submission text.
- Both `POST /api/projects/resolve` and `POST /api/projects/import` require an authenticated account authorized by `BAPX_ADMIN_GITHUB_USER_IDS` and reject a browser request whose `Origin` is not the exact Admin host.
- The import request contract is `{ "repositoryUrl": "<canonical resolved GitHub HTTPS URL>", "projectSlug": "<confirmed slug>", "confirmed": true }` at the request root. All three values are required. Every form-submission path, including keyboard submission, checks the live confirmation state before sending and forwards that state instead of manufacturing `true`.
- The current routed import mutation remains public-repository-only. A resolved private repository is displayed with its real visibility but the confirmation and import mutation stay disabled until credential-safe private clone wiring exists.
- Import resolves the canonical GitHub identity again at the mutation boundary, validates the confirmed slug and containment below `/root/bapx.in/projects/`, clones into a temporary sibling directory, verifies the Git commit, records an operation identifier with digest-free source metadata, and atomically renames the verified directory into the confirmed destination.
- Git clone and revision verification run through asynchronous child processes and are awaited by the existing POST handler. The 120-second command timeout, bounded output capture, cleanup, verification, and atomic rename contracts remain in the import owner, while the shared `apps-www` event loop stays available for concurrent Admin, Docs, Agents gateway, and public-page requests.
- Existing project directories are never overwritten. The import owner acquires an atomic hidden same-slug reservation before Git work, so concurrent requests for one confirmed destination cannot both clone and promote; exactly one may complete and the competing request receives structured `project_exists` evidence. The reservation records its process owner. A dead same-host owner is reclaimed immediately, while malformed or cross-host reservations become reclaimable only after ten minutes, safely beyond the two-minute Git timeout. Reservations and temporary clones are removed on completion or failure, so an interrupted process cannot permanently wedge later imports. Invalid or traversal-like slugs fail before directory creation.
- `git` must be installed in the `apps-www` runtime image. A missing executable returns `git_unavailable`; clone and revision failures return structured errors without exposing credentials or command output.
- A server restart is required after changing `apps/www/server.mjs`. Roll back by reverting the merge commit; imported project directories are user data and must not be deleted during code rollback.

### Authorized GitHub repository metadata

`apps/www/src/server/github-repository-metadata.mjs` owns the reusable metadata-resolution boundary used by the protected Admin Projects resolve operation and the later private-import flow.

- It accepts only the canonical identity produced by `resolveGitHubRepositoryReference()` and obtains installation authorization once per operation from an injected server-side provider.
- The provider owns token minting, caching, expiry, and refresh. The metadata resolver does not cache credentials and does not retry GitHub `401` or `403` responses because those statuses may represent repository scope or permission denial rather than token expiry.
- Provider exceptions and invalid provider results are converted to `github_installation_unavailable` without preserving provider messages, tokens, authorization headers, or raw context.
- Metadata calls request read Metadata capability. Read Contents capability is represented separately as `cloneAuthorized`; metadata success alone never implies clone permission.
- Returned data is restricted to repository ID, GitHub canonical casing, owner type, default branch, visibility/private state, archived state, clone capability, and a stable status. Archived repositories fail before later filesystem mutation.
- Installation tokens are opaque variable-length secrets. They must not be persisted, logged, returned, embedded in credential-bearing URLs, or copied into errors, telemetry, snapshots, or fixtures.
- HTTP integration reuses `/api/projects`, the existing Admin session and provider-ID authorization owner, and exact-origin mutation checks. It does not create another route family, token owner, project store, runtime, or frontend.

### GitHub App installation authorization

`apps/www/src/server/github-installation-authorization.mjs` owns server-side GitHub App JWT signing and installation-token acquisition for the metadata resolver and later private-import route integration.

- Deployment supplies `BAPX_GITHUB_APP_ID`, `BAPX_GITHUB_INSTALLATION_ID`, and `BAPX_GITHUB_APP_PRIVATE_KEY` only to the `apps-www` server process. IDs must be canonical positive decimal safe integers; partial numbers, decimals, signs, leading zeroes, zero, negative values, blanks, and unsafe integers fail closed as `github_installation_unavailable`.
- The private key may use real newlines or escaped `\n` separators. It remains a server secret and must never enter browser bundles, logs, errors, telemetry, fixtures, project metadata, or Git credential URLs.
- Every operation must request an explicit bounded permission set. Metadata resolution requests only `{ metadata: 'read' }`; a later clone-capable operation may request `{ metadata: 'read', contents: 'read' }`. Missing scopes, unsupported keys, write scopes, and any request without Metadata read fail closed before a GitHub call.
- Installation tokens are cached only inside the provider closure and are keyed by the normalized permission set. A metadata-only token can never satisfy a later Contents request, and a Contents-capable token is not reused for metadata-only work. Each scoped token is reused only while more than one minute remains before GitHub expiry.
- The provider requires GitHub's returned permission set to match the normalized request exactly before caching or returning a token. Missing requested scopes and stronger or additional scopes—including Contents write for a Contents-read request—fail closed and are never cached.
- The outbound token request is bounded by a ten-second abort signal. Configuration, signing, invalid permission requests, transport, non-success responses, malformed JSON, under-scoped responses, over-scoped responses, and malformed token payloads all map to the same secret-free `github_installation_unavailable` error.
- The provider performs one token request per permission-scope refresh attempt and does not retry ambiguous GitHub failures. Route integration preserves Admin authentication and provider-ID authorization before token acquisition, and exact-origin enforcement before any mutation.
- Changing these environment values or this module requires rebuilding and restarting the existing `apps-www` service. Validate metadata-only and Contents-read request bodies, cross-scope cache isolation, per-scope cache reuse and near-expiry refresh, malformed configuration and unsupported-scope rejection, request cancellation, under- and over-scoped response rejection without caching, and secret-free failures before deployment.

## Admin session handoff persistence

The platform store and existing auth router exchange an authenticated central-platform account for an Admin-host session without broadening the existing session cookie to the parent domain.

- Handoff bearer values are opaque 256-bit tokens. Persistence stores only their SHA-256 digests with the account id, `admin` audience, creation time, and absolute expiry.
- The lifetime is fixed by the store at 60 seconds. Callers cannot supply or extend the TTL, and redemption fails at the exact expiry boundary.
- Redemption is single-use in the documented single-process writer model: the matching digest is removed before the account is returned, so replay fails after a successful consume.
- Missing persistence initializes an empty version-1 collection. Malformed JSON, unsupported schema versions, invalid collection envelopes, and malformed persisted records fail closed and must not be overwritten as empty state.
- Every persisted record must contain a 64-character lowercase SHA-256 digest, a non-empty account id, the exact `admin` audience, parseable creation and expiry timestamps, and an expiry exactly 60 seconds after creation. Invalid record content or timing relationships are corruption, not expired data to prune.
- Expired records are removed during issuance and redemption. A failed redemption that consumes nothing and removes no expired records leaves persistence byte-for-byte unchanged.
- An anonymous Admin document request redirects to `bapx.in/api/auth/admin` with an allowlisted Admin return URL. An authenticated central session must pass the existing GitHub provider-ID authorization owner before the server returns a nonce-bound, no-store auto-submitting handoff form.
- `POST admin.bapx.in/api/auth/admin/handoff` accepts only the exact `https://bapx.in` origin, redeems the bearer once, revalidates entitlement, creates the existing host-only session cookie, and redirects only to an HTTPS Admin URL. Wrong-origin requests are rejected before body parsing; expired, unknown, and replayed handoffs return `authentication_required`.
- Anonymous Admin APIs continue returning JSON `401` rather than browser redirects. Anonymous Admin documents redirect through the central login and handoff flow, while authenticated non-Admin documents and APIs fail with `403`.
- The JSON consume sequence is acceptable only after deployment proves that one process can serve redemption. A multi-process deployment requires transactional storage or cross-process exclusive locking before an exposed redemption route is enabled.
- A restart discards only in-memory process state; persisted unexpired handoffs remain until consumed or pruned. Rollback of an exposed handoff flow must revoke persisted handoffs and Admin sessions while preserving default-deny Admin access.

## Production routing

The live `traefik-vmm1` deployment sends `agents.bapx.in` to `flue-www`, not directly to the agent runtime. `flue-www` and `agents-runtime` share `BAPX_RUNTIME_TOKEN`; the gateway talks to `http://127.0.0.1:3003`. The runtime container mounts its generated `dist/` and the repository `node_modules/` read-only. Validate both the unauthenticated login redirect and an authenticated streamed submission after recreating either service.

## Navigation

The left navigation follows the canonical demo/sidebar interaction and includes:

1. **New task** — starts a main-agent conversation.
2. **Threads** — lists conversations, tasks, recent work, filters, folders, and status.
3. **Pull requests** — repository review and delivery work.
4. **Automations** — includes time, recurring schedule, webhook, repository-event, connector-event, and manual triggers with reusable templates.
5. **Explore** — hosted search/browser/research workspace scoped to the selected business/project.
6. **Context** — project files, repositories, maps, documents, credentials visibility, and memory sources.
7. **MCPs** — business-owned Model Context Protocol connections, servers, tools, access, and credentials.
8. **Projects** — exposes workspace projects, repositories, files, maps, previews, hosted app subdomains, and changes rooted at `/root/bapx.in`.
9. **Team** — bapX people, roles, permissions, assignments, and human coordination.
10. **Agents** — main and role-specific agents, including their tools, responsibilities, availability, and work.
11. **Chat** — opens the existing working main-agent conversation entry point; it must not render a separate zero-state or duplicate chat implementation.

The project list remains visible below the main navigation, matching the supplied reference structure.

## First implementation boundary

The first implementation may expose Projects, Team, Agents, Automations, MCPs, and Pull requests as navigable zero states only when their backing operations do not yet exist. Every such surface must label the actual state and must not present dead controls as working. Main-agent chat and the existing workspace file API/editor are the first real capabilities to preserve and connect.

## Platform dependency

`platform.bapx.in` is not complete. Admin integration must not imply that OAuth, billing, key management, connectors, MCP configuration, project creation, real metrics, or observability are working until those operations are implemented and browser-validated.
