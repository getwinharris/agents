---
name: release

description: Release public npm packages from this repository. Use ONLY when the user explicitly asks to release and supplies patch, minor, major, or an explicit version number.
---

# Release

Perform a release only when the user has explicitly provided one of: `patch`, `minor`, `major`, or an explicit version number. If missing, ask for it and stop.

## Versioning

This project uses pre-1.0 semver semantics:

- `patch`: non-breaking changes. Increment `0.x.y` to `0.x.(y+1)`.
- `minor`: breaking changes. Increment `0.x.y` to `0.(x+1).0`.
- `major`: use only when explicitly requested; increment the major version normally.
- Explicit version: use exactly the provided version after confirming it is a valid semver version.

Before editing, inspect all workspace `package.json` files. Change versions only for public packages (`private` is not `true`). Keep public Bapx package versions aligned to the selected release version unless the user explicitly directs otherwise. Do not version or publish private packages.

## Workflow

1. Before any release work, run `git status --short --branch` and confirm the working directory is clean. If it is not clean, stop and ask before proceeding.
2. Read `CHANGELOG.md` and review the unreleased changes against the commits since the prior release. Ensure the selected release has an accurate dated changelog section; include its update in the release changes.
3. Check the installed versions of `@earendil-works/pi-ai` and `@earendil-works/pi-agent-core` against their latest npm versions. If either is outdated, warn the user and ask whether to update before continuing the release. If the user declines, continue without updating. If the user approves, review the upstream changelog for every intervening version and confirm the update is safe before running `npm install @earendil-works/pi-ai @earendil-works/pi-agent-core`.
4. Confirm the repository is on the intended current branch and determine the selected release version.
5. Inspect all workspace package manifests and update the `version` field in each public package `package.json` to the selected release version.
6. Run `npm install --lockfile-only` if necessary to update version-related lockfile metadata.
7. Rebuild from scratch: remove generated build outputs for public packages, then run the repository build command (`npm run build` from the repository root).
8. Run repository validation before publishing: `npm run check` from the repository root.
9. Prepare publish artifacts: run `node scripts/prepare-publish.mjs` from the repository root. This copies the docs content into each public package's `docs/` folder (gitignored) and syncs the root `README.md` into the core packages (`@bapX/cli`, `@bapX/runtime`, `@bapX/sdk`).
10. Publish each public package from its package directory using `npm publish --workspaces --if-present`. Publish in dependency order when required (for this repository, publish `@bapX/runtime` before packages that depend on it).
11. Inspect the final diff and stage only release-generated changes, including the changelog, package versions, lockfile updates, and build or prepublish-generated tracked files.
12. Commit after publication with `git commit -m "chore: release v<VERSION>"`.
13. Tag that final commit with `git tag v<VERSION>`.
14. Push the current branch, then push the tag: `git push` followed by `git push --tags`.

## Guardrails

- Do not begin without an explicitly stated release increment or version.
- Do not alter files, build, validate, or publish until the initial clean working-directory check has succeeded and `CHANGELOG.md` has been reviewed.
- Never use a normal `npm publish`; always include `-r --no-git-checks` because publishing occurs from an intentionally unclean release tree before the commit.
- Never commit unrelated pre-existing work.
- Never create the tag until publishing and the release commit both succeed.
- If publish fails partway through, stop and report which packages published; do not tag or push.
- If verification, commit, tag, or push fails, stop and report the failure rather than changing the requested version.
