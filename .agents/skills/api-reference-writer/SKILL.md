---
name: api-reference-writer
description: Creates and rewrites Bapx API reference documentation from package-visible TypeScript exports and audited source-adjacent JSDoc. Use when authoring concise reference pages under apps/docs/src/content/docs/api/ or reference pages such as reference/configuration.md. Do not use for narrative guides, tutorials, or automated maintenance checks.
---

# Bapx API Reference Writer

Create concise, lookup-oriented Bapx reference documentation from the supported public TypeScript interface. Treat source-adjacent JSDoc as the canonical home for public reference material and Markdown pages as a faithful editorial projection of that material.

This skill covers the initial documentation pass. Do not design a generator, manifest, CI check, or automated maintenance workflow unless the user explicitly asks for one.

## Desired result

Reference pages should resemble Vite's configuration reference: a lightly organized list of documented exports, interfaces, methods, properties, or options. Keep narrative close to zero.

A reference page should help readers answer:

- What can I import or configure?
- What is the TypeScript signature or field type?
- What does it do?
- What is the default, when one exists?
- What constraints, lifecycle semantics, or deprecations matter when using it?

Move broad concepts, end-to-end procedures, deployment setup, and extended examples into guides rather than preserving them in reference pages.

## Core principles

1. **Start from the package entrypoint.** Package-visible exports define the candidate public surface. Do not inventory every source-level `export`, because implementation modules may export helpers for internal composition.
2. **Audit the supported surface before documenting it.** A package-visible export may still be accidental, internal, compatibility-only, or deprecated. Identify that before presenting it as supported API.
3. **Treat existing JSDoc as unreviewed draft input.** It may be stale, incomplete, overly internal, inconsistent, or missing. Verify every public claim against implementation, tests, and examples.
4. **Keep public reference prose beside the declaration it documents.** Improve source-adjacent JSDoc instead of creating a duplicate declaration file or making Markdown the factual source of truth.
5. **Let TypeScript describe TypeScript.** Do not duplicate parameter types, return types, overloads, or property types in JSDoc when the declaration already expresses them clearly. Use JSDoc for meaning, defaults, constraints, lifecycle details, and short examples.
6. **Project JSDoc faithfully into Markdown.** Markdown may group and order symbols for readers, but it should not invent a second, richer narrative contract.
7. **Prefer a small supported API.** If reference work reveals accidental exports or confusing overlap, call it out. Narrow the public interface when practical and in scope rather than documenting accidental complexity forever.
8. **Do not expand scope automatically.** When the audit exposes ambiguous semantics, bugs, or limitations, ask whether to fix them, document current behavior, or record a nearby TODO and defer them.
9. **Do not bless implementation quirks accidentally.** Public JSDoc should describe behavior the project is willing to support. Record questionable existing behavior near the implementation until the contract is decided.

## Workflow

### 1. Select one reference page

Work on one page at a time. Read:

- the current Markdown page;
- its docs navigation entry;
- nearby guides that may own narrative material;
- the relevant package `package.json` export map.

Identify the page's intended import path or configuration root. Examples:

- `@bapX/runtime`
- `@bapX/runtime/routing`
- `@bapX/runtime/node`
- `@bapX/runtime/cloudflare`
- `@bapX/cli/config`

### 2. Enumerate package-visible exports

Inspect the package export map, the public source barrel, and generated declarations when available. Use package subpaths as the boundary.

Classify each candidate export:

| Classification        | Meaning                                              | Documentation treatment                                       |
| --------------------- | ---------------------------------------------------- | ------------------------------------------------------------- |
| Supported             | Intended user-facing API                             | Include on the relevant reference page.                       |
| Internal              | Generated-server or implementation plumbing          | Exclude from user reference docs.                             |
| Compatibility-only    | Preserved for migration behavior                     | Document only when migration context is useful.               |
| Deprecated            | Still supported but discouraged                      | Include the deprecation and replacement clearly.              |
| Deferred              | Potentially public, but its contract needs an audit  | Record the follow-up and omit it from this page for now.      |
| Accidental or unclear | Export visibility does not prove intentional support | Ask or propose narrowing before documenting it as stable API. |

Do not assume every symbol from an entrypoint belongs on the selected page. A root entrypoint may feed several editorially grouped pages. Package visibility is a candidate inventory, not an obligation to document every export during the current pass.

### 3. Locate owning declarations and behavior

For each in-scope symbol:

- locate the source declaration;
- inspect surrounding implementation;
- inspect tests and examples when semantics are not obvious;
- distinguish authored input shapes from resolved or internal shapes;
- identify defaults, validation, errors, cancellation behavior, persistence boundaries, and lifecycle semantics that matter to users.

Prefer comments on the actual declaration. If an exported function is a façade over another module, document the owning function or interface rather than duplicating prose in the barrel.

When investigation reveals a questionable implementation behavior, do not silently promote it into the public contract. Ask whether to:

1. fix the behavior now and document the corrected contract;
2. document the current behavior intentionally; or
3. record a nearby TODO and defer that surface from the current page.

### 4. Audit and rewrite JSDoc

Rewrite JSDoc for public consumption. Remove implementation commentary that does not help users consume the API. Add missing public details only after verifying them.

Use JSDoc for:

- the purpose of a symbol or property;
- defaults;
- accepted behavior that the type alone cannot express;
- precedence or lifecycle rules;
- meaningful errors and no-op behavior;
- deprecations and preferred replacements;
- one short example when it materially clarifies usage;
- links to related declarations when useful.

Avoid:

- restating obvious TypeScript syntax;
- copying parameter lists into prose;
- long tutorials;
- internal design rationale;
- speculative future behavior;
- repeating the same explanation on several declarations;
- comments that describe accidental behavior without confirming it is part of the supported contract.

Example:

```ts
export interface UserBapxConfig {
  /**
   * Build and development target. Required unless `--target` is passed to the
   * CLI.
   */
  target?: 'node' | 'cloudflare';

  /**
   * Project root. Relative paths resolve from the directory containing the
   * selected `bapX.config.*` file. Defaults to that directory.
   */
  root?: string;
}
```

### 5. Rewrite Markdown as concise reference

Project the audited JSDoc into Markdown with minimal editorial structure.

A typical configuration option should look like:

```md
## root

- **Type:** `string`
- **Default:** directory containing the selected `bapX.config.*` file

Project root. Relative paths resolve from the directory containing the selected
configuration file.
```

A typical exported function should look like:

````md
## `defineConfig()`

```ts
function defineConfig(config: UserBapxConfig): UserBapxConfig;
```

Provides type checking and editor completion for `bapX.config.ts`. Returns the
configuration unchanged.
````

Use only enough page-level introduction to identify the import path and scope. Include short examples only when they clarify a declaration more effectively than prose.

### 6. Relocate rather than preserve narrative

When an existing reference page contains useful but misplaced guide material:

- identify the content that no longer belongs;
- identify the likely owning guide;
- ask before moving or deleting substantial material when scope is unclear;
- do not keep narrative in the reference page solely to avoid losing it.

Reference cleanup may intentionally become a follow-up guide task.

### 7. Verify the scoped change

After editing:

- build the owning package when it emits declarations;
- inspect the generated `.d.ts` or `.d.mts` entrypoint to confirm the audited JSDoc is preserved and reads well after emission;
- read the resulting source JSDoc and Markdown together;
- confirm Markdown claims map back to audited source JSDoc;
- confirm every in-scope supported symbol is covered;
- confirm excluded or deferred symbols are intentionally classified;
- run relevant package type checks and docs type checks or builds provided by the repository.

## Page-shaping guidance

Use editorial grouping only where it improves lookup. Good grouping examples:

- configuration fields under one authored config interface;
- agents, profiles, harnesses, sessions, and session operations on one Agent API page;
- application composition functions under `@bapX/runtime/routing`;
- observable event unions and errors on an Events Reference page.

Avoid introducing a separate manifest during the initial pass. For now:

- package entrypoints define candidate public boundaries;
- source-adjacent audited JSDoc owns reference facts;
- Markdown pages and navigation own reader-facing grouping and ordering.

## Bapx-specific boundaries

Use these distinctions while auditing:

- Runs are workflow-only. Direct agent prompts and dispatched agent inputs are not runs.
- Agents have names; agent instances have ids; harnesses and sessions have names; operations have generated ids.
- `@bapX/runtime/internal` is generated-server plumbing, not supported user API.
- Compatibility subpaths should not be presented as ordinary supported surfaces.
- For `@bapX/cli/config`, distinguish authored configuration such as `UserBapxConfig` from resolved internal shapes such as `BapxConfig`.

## Completion handoff

At the end of a page pass, report briefly:

- which public surface was audited;
- which JSDoc declarations were rewritten;
- which Markdown page was rewritten;
- any exports classified as accidental, unclear, internal, compatibility-only, deprecated, or deferred;
- any nearby TODOs recorded for behavior or contract follow-ups;
- any narrative material that should move into a guide later.
