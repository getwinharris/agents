---
title: Google Cloud
description: Use Google Cloud infrastructure and gcloud-controlled deployments with bapX projects.
lastReviewedAt: 2026-07-26
---

Google Cloud is a hosting and infrastructure option for bapX projects that need Google-managed compute, networking, storage, or deployment operations.

For developer and agent-operated environments, install and authenticate the official Google Cloud CLI (`gcloud`) before running deployment or infrastructure commands. On Debian-based systems, follow Google's apt/deb package instructions for the Google Cloud SDK.

## Current bapX status

Google Cloud is cataloged as a hosting and infrastructure connection. A shipped bapX connector must keep Google Cloud authorization separate from Google Workspace user connectors, scope credentials to the selected account/business/project, and expose deploy actions through approved Admin/Agents operations rather than a global shell.

## CLI surface

| CLI | Purpose |
| --- | --- |
| `gcloud` | Google Cloud project, auth, deployment, and infrastructure operations. |
| `googleworkspace` | Google Workspace user/business operations when the user authorizes that connector. It is separate from Google Cloud hosting. |

See [bapXhost](/docs/ecosystem/deploy/bapx-host/), [Node.js](/docs/ecosystem/deploy/node/), and [Platform overview](/docs/platform/overview/).
