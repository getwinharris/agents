# Flue Blueprints

This directory contains the source-of-truth Markdown implementation guides returned by `flue add`. They are served at `https://flueframework.com/cli/blueprints/<slug>.md`.

A blueprint is a Markdown guide for an AI coding agent, not an npm package or runtime abstraction. The CLI fetches and prints the guide; the coding agent edits the user's project.

## Supported kinds

| Kind       | Result                                                            |
| ---------- | ----------------------------------------------------------------- |
| `sandbox`  | A sandbox adapter for a remote execution provider.                |
| `channel`  | Verified provider ingress, a client, and application-owned tools. |
| `database` | A database adapter implementing Flue's `PersistenceAdapter`.      |

Do not introduce a new kind without first discussing the required CLI, runtime, and maintenance changes with the Flue team. New blueprints within an existing kind are welcome.

## File naming

Named blueprints use `<kind>--<name>.md`. Generic kind guides use `<kind>.md` and set `"root": true`.

```text
blueprints/
  sandbox.md
  sandbox--daytona.md
```

The double dash leaves provider names containing a single dash unambiguous. The index generator derives these routes:

- `<kind>--<name>.md` becomes `<name>`.
- `<kind>.md` is available by kind for `flue add <kind> <url>`.

The generator is `packages/cli/scripts/generate-blueprint-index.ts`. Duplicate slugs are rejected.

## Frontmatter

Every blueprint starts with JSON frontmatter fenced by `---`. It is JSON, not YAML.

Generic kind guide:

```json
{ "kind": "sandbox", "root": true }
```

Named blueprint:

```json
{ "kind": "sandbox", "website": "https://daytona.io" }
```

| Field     | Type     | Required for     | Description                             |
| --------- | -------- | ---------------- | --------------------------------------- |
| `kind`    | string   | every blueprint  | `sandbox`, `channel`, or `database`     |
| `website` | string   | named blueprints | Provider homepage shown by `flue add`   |
| `aliases` | string[] | optional         | Additional names accepted by `flue add` |
| `root`    | boolean  | generic guides   | Must be `true`                          |

The website strips frontmatter before returning the guide.

Aliases are for established package or product names that users are likely to enter, such as `@vercel/sandbox`. Use them sparingly. They must not collide with another slug or alias; matching is case-insensitive.

## Body conventions

The body is an implementation guide consumed by an AI coding agent. Follow the conventions for its kind.

### Sandbox adapter blueprints

A sandbox blueprint should:

1. Explain that it installs a sandbox adapter and that the application owns the provider resource lifecycle.
2. Select the first existing source root from `<root>/.flue/`, `<root>/src/`, and `<root>/`.
3. Write the implementation to `<source-root>/connectors/<name>.ts`; this generated project path remains intentionally named `connectors`.
4. Include complete TypeScript ready to write, required dependencies, authentication, agent wiring, and verification steps.
5. Use runtime API names such as `SandboxFactory` exactly as exported.

Generic `sandbox.md` points to the sandbox adapter contract and a known implementation blueprint instead of embedding one provider implementation.

### Channel blueprints

A channel blueprint should:

1. Inspect the target, source root, app entrypoint, agents, environment types, and secret conventions.
2. Install a first-party ingress package when available and an established outbound SDK or narrow Fetch client.
3. Create `channels/<provider>.ts` with named `channel` and `client` exports.
4. Use constructor-owned verified callbacks and exact default-path guidance.
5. Dispatch normalized provider input and stable delivery identity.
6. Define only requested tools, with trusted destinations outside model arguments.
7. Verify signed payloads against the project's actual build target.

Do not imply a common provider-client API, install generic tool collections, or add `app.ts` solely to mount a discovered channel.

### Database adapter blueprints

Database blueprints produce a source-root `db.ts` that default-exports a `PersistenceAdapter`, not a file under `connectors/`.

Named blueprints with first-party packages install `@flue/<backend>` and create a small `db.ts`. The generic guide points to the `PersistenceAdapter` contract and the PostgreSQL blueprint as an implementation example.

Database adapters are for the Node target; Cloudflare uses Durable Object SQLite and rejects `db.ts`. Read connection strings from the environment and do not store application business data in the adapter.

## Adding a blueprint

1. Create `blueprints/<kind>--<name>.md` with JSON frontmatter and an implementation guide.
2. Run the CLI prebuild to regenerate the blueprint index and validate frontmatter.
3. Run the website locally and check `http://localhost:4321/cli/blueprints/<name>.md`.
4. Pipe `flue add <kind> <name>` to a coding agent in a sample project and verify the resulting implementation.
