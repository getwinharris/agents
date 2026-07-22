---
title: Map
description: Generate and validate map.mmd files for bapX user, business, demo, and project workspaces.
---

`bapX map` owns project map generation. Do not add standalone map scripts or parallel map files.

## Usage

```sh
bapX map --root <path>
bapX map --root <path> --check
```

`--check` validates that `<path>/map.mmd` exists and matches the map generated from the current source layout.

## Profiles

Profiles add required-file checks on top of map freshness.

```sh
bapX map --root demo --check --profile demo-project
bapX map --root <real-user-workspace-path> --check --profile user-workspace
bapX map --root <real-business-workspace-path> --check --profile business-workspace
bapX map --root <real-project-workspace-path> --check --profile user-project
```

`demo-project` requires `OKF.md`, `README.md`, `map.mmd`, `docs/index.md`, `docs/map.mmd`, `src/`, and `src/lib/bapX-client.ts`.

`user-workspace` requires `.git/`, `OKF.md`, `index.yaml`, and `map.mmd`.

`business-workspace` requires `index.yaml`, `map.mmd`, `DESIGN.md`, `brand.css`, `logos/index.yaml`, `logos/map.mmd`, `projects/index.yaml`, and `projects/map.mmd`.

`user-project` requires `index.yaml`, `map.mmd`, `docs/`, `docs/index.yaml`, and `docs/map.mmd`.

Map validation does not replace browser tests, package tests, or source inspection. Use it as the structure check before release evidence.
