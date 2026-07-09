---
title: bapX docs
description: Reference for listing, reading, and searching the bundled Bapx documentation.
lastReviewedAt: 2026-06-09
---

## Synopsis

```bash
bapX docs
bapX docs read <path>
bapX docs search <query>
```

## Description

`bapX docs` works with the documentation bundled inside the installed `@bapX/cli` package. It requires no network access, and its content always matches the installed CLI version.

With no arguments, the command prints usage hints and the full page catalog. `read` prints one page as Markdown. `search` prints ranked results as JSON.

The catalog, page Markdown, and search JSON print to stdout; usage hints and errors print to stderr.

## Subcommands

| Subcommand       | Description                                         |
| ---------------- | --------------------------------------------------- |
| _(none)_         | List every documentation page with path and title.  |
| `read <path>`    | Print one documentation page as Markdown.           |
| `search <query>` | Search the documentation and print results as JSON. |

## Page paths

`read` accepts the catalog path as printed by `bapX docs`, plus equivalent website forms:

```bash
bapX docs read guide/sandboxes
bapX docs read /docs/guide/sandboxes/
bapX docs read https://bapx.in/docs/guide/sandboxes/
```

Unknown pages exit with status `1`.

## Search output

`search` joins multiple arguments into one query and prints the top eight matches:

```json
{
  "query": "durable execution",
  "results": [
    {
      "path": "concepts/durable-execution",
      "title": "Durable Agents",
      "description": "Understand how Bapx agents and workflows handle server restarts, interrupted connections, and other disruptions.",
      "excerpt": "Durable execution is about recovering safely when running work is disrupted by a server restart, deployment, lost connec…",
      "score": 138.34
    }
  ]
}
```

## Examples

```bash
bapX docs
bapX docs read guide/sandboxes
bapX docs search "durable execution"
bapX docs search sandbox adapter
```

For coding agents, the typical loop is `bapX docs search <query>` to find a page, then `bapX docs read <path>` to read it.
