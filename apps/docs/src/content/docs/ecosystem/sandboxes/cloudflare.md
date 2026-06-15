---
title: Cloudflare Sandbox
description: Run Flue agent work inside Cloudflare container-backed sandboxes.
---

Cloudflare Sandbox uses `@cloudflare/sandbox` to provide a container-backed Linux environment to a Flue application deployed on Cloudflare. This integration is platform-native: it is not an adapter module for a Node-target application.

## Use the Cloudflare target

Cloudflare Sandbox requires a Worker deployment, Durable Object/container configuration, and a container image. Add the dependency to a Cloudflare-targeted project and export its Durable Object class from your Cloudflare deployment module:

```ts
// <source-root>/cloudflare.ts
export { Sandbox } from '@cloudflare/sandbox';
```

Declare the sandbox binding in Wrangler configuration, then wrap the RPC stub returned by `getSandbox(...)` with `cloudflareSandbox(...)` and pass it to an agent:

```ts
import { getSandbox } from '@cloudflare/sandbox';
import { createAgent } from '@flue/runtime';
import { cloudflareSandbox } from '@flue/runtime/cloudflare';

type Env = { Sandbox: DurableObjectNamespace };

export default createAgent<unknown, Env>(({ id, env }) => ({
  model: 'anthropic/claude-sonnet-4-6',
  sandbox: cloudflareSandbox(getSandbox(env.Sandbox, id)),
  cwd: '/workspace',
}));
```

## Requirements

| Requirement            | Value                                                                          |
| ---------------------- | ------------------------------------------------------------------------------ |
| Target                 | Cloudflare only                                                                |
| Package                | `@cloudflare/sandbox`                                                          |
| Platform configuration | Container image and Durable Object/container binding in Wrangler configuration |
| Environment            | Linux container filesystem and command behavior                                |
| Lifecycle identity     | Choose stable sandbox identity and retention appropriate to your application   |

## Choose this integration when

Use Cloudflare Sandbox when an agent on Cloudflare needs git, package installation, native binaries, or other Linux tooling. Prefer Cloudflare Shell instead when a durable workspace with Workspace-oriented operations is sufficient and a Linux toolchain is unnecessary.

Treat network egress, mounted data, credentials, and side effects as application security decisions. See [Sandboxes](/docs/guide/sandboxes/#remote-sandboxes) and [Deploy on Cloudflare](/docs/ecosystem/deploy/cloudflare/).
