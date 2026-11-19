---
type: "Internal Doc"
title: "Cloudroom subtree maintenance"
description: "Provenance, update procedure, licensing, and deployment boundary for the imported Cloudroom source."
---
# Cloudroom subtree maintenance

`upstream/cloudroom/` is a squashed Git subtree of
[`davidondrej/cloudroom`](https://github.com/davidondrej/cloudroom). It was
imported from this exact revision:

```text
upstream URL: https://github.com/davidondrej/cloudroom.git
upstream commit: 5ada4d9e1d2703ec812864845e6fed05083f8072
subtree prefix: upstream/cloudroom
```

The agents-repository import commit records the same revision in its
`git-subtree-split` trailer. Treat the revision above as the current provenance
pin, not as a promise to follow upstream `main` automatically.

## VM-first scope

bapX runs on a VM. The initial reusable execution target is therefore
`upstream/cloudroom/core/`: Cloudroom documents this as the Rust service that
runs agents in the cloud and supports self-hosting on Ubuntu 24.04. The imported
GUI remains available for study and selective adaptation, but its upstream
source build requires macOS on Apple Silicon and must not be treated as the VPS
production frontend or build target.

No production cutover occurred as part of this import. The existing bapX
runtime, routes, containers, deployment process, and live Agents/Admin surfaces
remain authoritative until separately implemented, reviewed, deployed, and
verified work changes that boundary.

## Inspect and update the subtree

Run these commands from the agents repository root. Inspection is read-only:

```bash
git log -1 --format='%H%n%B' --grep='git-subtree-dir: upstream/cloudroom'
git ls-remote https://github.com/davidondrej/cloudroom.git refs/heads/main
```

Before updating, review upstream changes between the recorded pin and the
candidate revision. Pull a reviewed revision explicitly; do not make an
unreviewed floating update:

```bash
git fetch https://github.com/davidondrej/cloudroom.git main
git log --oneline 5ada4d9e1d2703ec812864845e6fed05083f8072..FETCH_HEAD
git subtree pull --prefix=upstream/cloudroom https://github.com/davidondrej/cloudroom.git <reviewed-commit> --squash
```

Replace `<reviewed-commit>` with the full commit ID selected from the fetched
history. After the pull, update the provenance pin in this document and validate
the affected components under `upstream/cloudroom/AGENTS.md`. For the VM-first
core, Cloudroom's required checks are:

```bash
cd upstream/cloudroom/core
cargo fmt --check
cargo clippy --locked --all-targets -- -D warnings
cargo test --locked --all-targets
```

Keep bapX adaptations outside the subtree when an adapter boundary is practical.
When an upstream file must change, keep the change focused and expect the next
subtree pull to require conflict review.

## License and notices

The imported work is licensed under Apache License 2.0 in
`upstream/cloudroom/LICENSE`. Its `upstream/cloudroom/NOTICE` retains the MIT
license and copyright notice for BB, on which the GUI is based.

Do not delete, rename, or replace either file during pruning or redistribution.
When distributing Cloudroom source or binaries, include the Apache license,
preserve applicable attribution and notices, mark modified files as changed as
required by Apache-2.0, and carry the NOTICE contents in the form appropriate to
the distribution. Any retained BB code or substantial portions must retain its
MIT copyright and permission notice. Review newly introduced upstream
dependencies and notices on every update rather than assuming these two files
cover later revisions.
