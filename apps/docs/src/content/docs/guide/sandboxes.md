---
title: Sandboxes
description: Choose filesystem and compute environments for agents across local and hosted runtimes.
---

A **sandbox** is the filesystem and execution boundary available to a Flue harness. Choose it according to what the agent must be able to read, write, execute, retain, and reach over the network.

This guide helps you select and configure that boundary for TypeScript applications running on Node.js or Cloudflare. It covers the lightweight default, deliberate host access on Node, remote connector-backed environments, and the two distinct Cloudflare approaches for durable workspaces and Linux containers.

For how to configure addressable agents, read [Agents](/docs/guide/building-agents/). For initialization and sessions inside finite orchestration, read [Workflows](/docs/guide/workflows/). For model-visible and application-defined capabilities, read [Tools](/docs/guide/tools/). For authored project source versus runtime workspace context, read [Project Layout](/docs/guide/project-layout/).

## Configure the sandbox on a created agent

Configure `sandbox` and `cwd` in the runtime configuration returned from `createAgent(...)`. `init(...)` initializes that already-configured environment; it does **not** accept a sandbox or working directory.

```ts title=".flue/workflows/summarize-files.ts"
import { createAgent, type FlueContext } from '@flue/runtime';

const summarizer = createAgent(() => ({
  model: 'anthropic/claude-sonnet-4-6',
  cwd: '/workspace',
}));

export async function run({ init, payload }: FlueContext<{ report: string }>) {
  const harness = await init(summarizer);
  await harness.fs.writeFile('inputs/report.md', payload.report);

  const session = await harness.session();
  return session.prompt('Read inputs/report.md and summarize the report.');
}
```

Omitting `sandbox`, or setting `sandbox: false`, selects the target's default lightweight sandbox. In this example, `cwd: '/workspace'` scopes relative filesystem and shell paths inside that sandbox: `inputs/report.md` resolves below `/workspace`.

| Created-agent field | What it controls |
| --- | --- |
| `sandbox` | The filesystem and command-execution implementation used by the harness, its sessions, and sandbox-backed model tools. |
| `cwd` | The working directory inside the selected sandbox, used for relative paths and runtime context discovery. |
| `persist` | Conversation-state storage for sessions; it does not determine filesystem durability. |

`cwd` selects runtime workspace context as well as relative paths. During initialization, Flue discovers guidance such as `<cwd>/AGENTS.md`, `<cwd>/CLAUDE.md`, and `<cwd>/.agents/skills/<name>/SKILL.md` only when those files exist **inside the sandbox**. Files beside authored `.flue/agents/` or `.flue/workflows/` modules are not automatically available in an empty or remote runtime filesystem. See [Project Layout](/docs/guide/project-layout/), [Agents](/docs/guide/building-agents/), and [Workflows](/docs/guide/workflows/).

## Start with the default lightweight sandbox

Both generated Node.js and generated Cloudflare runtimes create the same kind of default environment: an in-process `just-bash` `Bash` instance backed by an `InMemoryFs` filesystem. It is useful when an agent needs a small scratch workspace, staged input files, or basic shell and file operations without access to the host filesystem.

```ts title="Use the default sandbox"
import { createAgent } from '@flue/runtime';

const assistant = createAgent(() => ({
  model: 'anthropic/claude-sonnet-4-6',
  cwd: '/workspace',
}));
```

The generated default environment has these important boundaries:

| Property | Default behavior |
| --- | --- |
| Filesystem | A fresh `InMemoryFs` instance; it does not contain your application repository or host filesystem. |
| Starting content | Empty of your application files until your code or the agent writes data into it. The virtual runtime provides its basic filesystem structure. |
| Command surface | Lightweight `just-bash` shell behavior, suitable for basic workspace operations; it is not a general Linux host or container toolchain. |
| Network | The currently generated Node and Cloudflare entries construct `Bash` with full internet access enabled. Treat network use as permitted unless you select and configure another boundary. |
| Durability | Do not rely on default sandbox files surviving a later harness initialization, process restart, Durable Object lifecycle change, or deployment. |
| Host access | It is not the Node host filesystem or host shell. Use `local()` deliberately when host access is required on Node. |

Do not describe the default sandbox as non-networked or durable. It is lightweight and isolated from the host filesystem, but current generated entries enable its network access and create an in-memory filesystem for each initialized environment.

### Stage controlled files into the default workspace

A useful default-sandbox pattern is to give an agent a bounded set of inputs rather than an entire repository or host filesystem:

```ts title=".flue/workflows/answer-from-article.ts"
import { createAgent, type FlueContext } from '@flue/runtime';

const support = createAgent(() => ({
  model: 'anthropic/claude-sonnet-4-6',
  cwd: '/workspace',
}));

export async function run({ init, payload }: FlueContext<{ question: string }>) {
  const harness = await init(support);
  await harness.fs.mkdir('articles', { recursive: true });
  await harness.fs.writeFile(
    'articles/password-reset.md',
    '# Password reset\n\nA reset link is available from account settings.',
  );

  const session = await harness.session();
  return session.prompt(`Search the supplied articles and answer: ${payload.question}`);
}
```

Use this strategy when application code can curate all required input material and you do not need a native toolchain, persistent workspace, or an existing checkout.

## Understand filesystem, shell, and model-facing tools

A harness and its sessions share the selected sandbox. Application code can work with it directly through `harness.fs`, `session.fs`, `harness.shell(...)`, and `session.shell(...)`; a model-driven operation may also receive sandbox-backed tools.

| Surface | Who initiates it? | Conversation effect |
| --- | --- | --- |
| `harness.fs` / `session.fs` | Your application code | Reads and writes files out of band; the model is not told automatically. |
| `harness.shell(command)` | Your application code | Runs setup or inspection out of band. |
| `session.shell(command)` | Your application code | Records the command exchange in that session so subsequent turns can reason about it. |
| Built-in model tools | The model during `prompt()`, `skill()`, or `task()` | Tool calls and results become model/session context and observable activity. |

The filesystem surfaces provide `readFile()`, `readFileBuffer()`, `writeFile()`, `stat()`, `readdir()`, `exists()`, `mkdir()`, and `rm()`. Relative paths use the created agent's `cwd`; use absolute paths when code must behave identically across connector defaults.

By default, sandbox-backed model operations receive file and command tools such as `read`, `write`, `edit`, `bash`, `grep`, and `glob`, together with Flue's framework-owned `task` delegation tool. Their capability boundary is the selected sandbox: the same `bash` tool is materially different in an in-memory default environment, the Node host, or a Linux container.

A `SandboxFactory` may define its own `tools` factory. In that case, the connector's returned model-facing tools replace the normal `read`/`write`/`edit`/`bash`/`grep`/`glob` set for that sandbox; Flue still supplies `task`. This is why prompts should not assume ordinary shell tools are available when using a platform-specific connector. See [Tools](/docs/guide/tools/#use-built-in-sandbox-tools) and [Workflows](/docs/guide/workflows/) for application-owned staging and shell use.

### Separate conversation persistence from filesystem durability

A named session preserves conversation state according to its `SessionStore`; the sandbox controls workspace files. These are separate decisions.

| State | Controlled by |
| --- | --- |
| Messages, tool transcript, compaction checkpoints, and session continuity | Target default session store or the created agent's `persist` configuration. |
| Files, installed packages, checkout changes, and generated artifacts | The selected sandbox or workspace connector. |
| Effects on APIs, repositories, or other systems reached through shell/tools | Those external systems and your authorization/idempotency design. |

A Cloudflare Durable Object-backed session can retain conversation history while its default in-memory sandbox starts fresh. Conversely, a durable Cloudflare Shell Workspace can retain files while a separately configured session store does not retain a conversation. Make both choices explicitly when continuity matters.

## Use `local()` for trusted Node.js host access

On the Node target, import `local()` from `@flue/runtime/node` when an agent must operate directly on the machine running the Flue application: for example, a trusted CI checkout or a single-tenant developer tool.

```ts title=".flue/agents/repository-reviewer.ts"
import { createAgent } from '@flue/runtime';
import { local } from '@flue/runtime/node';

export default createAgent(() => ({
  model: 'anthropic/claude-sonnet-4-6',
  sandbox: local(),
  cwd: '/srv/checkouts/catalog-service',
  instructions: 'Inspect the requested change and run only relevant validation.',
}));
```

`local()` is a host-backed `SandboxFactory`:

| Capability | `local()` behavior |
| --- | --- |
| Filesystem methods | Read and write the real host filesystem at paths reachable by the process. |
| Shell commands | Run through Node's host `child_process.exec`, using the selected working directory. |
| Default working directory | `process.cwd()` unless `cwd` is configured through `local({ cwd })` or the created agent. |
| Shell binaries | Commands available on the host execution path can be invoked by sandbox shell/model tools. |
| Isolation | None from Flue beyond explicit environment forwarding; the process and OS boundary is your security boundary. |

**Security boundary:** `local()` gives model-directed filesystem and shell capability on the application host. Use it only where the running machine, available files, installed executables, and task inputs are already trusted for that access, such as a disposable CI runner. Do not use `local()` as a multi-tenant isolation mechanism or to expose a sensitive production host to untrusted prompts.

See [Deploy on Node.js](/docs/ecosystem/deploy/node/) for target setup and [Routing](/docs/guide/routing/) before exposing an agent that has host-backed capabilities over a network route.

### Forward environment variables explicitly

`local()` does not automatically pass the entire host `process.env` to commands. At sandbox construction, it snapshots a shell-essential allowlist:

```text title="Default host variables exposed by local()"
PATH HOME USER LOGNAME HOSTNAME SHELL LANG LC_ALL LC_CTYPE TZ TERM TMPDIR TMP TEMP
```

Pass only the additional values required by commands in that sandbox:

```ts title="Allow one required command credential"
import { createAgent } from '@flue/runtime';
import { local } from '@flue/runtime/node';

const ciReviewer = createAgent(() => ({
  model: 'anthropic/claude-sonnet-4-6',
  sandbox: local({
    env: {
      GH_TOKEN: process.env.GH_TOKEN,
    },
  }),
  cwd: process.cwd(),
}));
```

Values passed through `local({ env })` are available to shell execution and therefore potentially to model-selected shell commands. Passing `env: { ...process.env }` deliberately exposes the full host environment, including any credentials it contains; avoid it unless that is truly the intended trust boundary. You can set an allowlisted key to `undefined` to remove it, and per-call shell `env` values layer on top of the sandbox's captured environment.

When the model needs one privileged action rather than an unrestricted credential-bearing shell, prefer an application-defined tool that performs that narrow action in trusted code; see [Tools](/docs/guide/tools/).

## Supply a custom lightweight Bash factory when needed

A created agent can accept a `BashFactory`: a function that constructs a Bash-like runtime when the harness initializes. This is useful for supplying an application-prepared in-memory filesystem or deliberately customizing a lightweight virtual environment.

```ts title="Use an application-prepared in-memory filesystem"
import { createAgent } from '@flue/runtime';
import { Bash, InMemoryFs } from 'just-bash';

const reviewer = createAgent(() => ({
  model: 'anthropic/claude-sonnet-4-6',
  cwd: '/workspace',
  sandbox: async () => {
    const fs = new InMemoryFs();
    await fs.mkdir('/workspace', { recursive: true });
    await fs.writeFile('/workspace/policy.md', 'Review only the supplied material.');
    return new Bash({ fs });
  },
}));
```

This factory constructs a fresh seeded filesystem for each harness initialization. If you intentionally capture one `InMemoryFs` outside the factory, later initializations in the same process or isolate share mutable files; do not use that pattern for tenant- or session-specific data unless shared workspace state is explicitly designed and authorized.

A `BashFactory` must return an object with `exec(...)`, `getCwd()`, and the expected filesystem methods. Flue adapts that object to its session environment. When shell commands supply timeouts, Flue translates them into an abort signal for this factory boundary.

Pass the factory function, not an already-created `Bash` object. Direct Bash-like object values in `sandbox` are rejected; use a factory returning `new Bash(...)` instead. A custom factory also means you own its network and filesystem choices rather than inheriting assumptions from the generated default.

## Connect an application-owned remote sandbox

Use a remote sandbox when untrusted or tenant-specific work needs a stronger execution boundary than the Node host, or when the agent needs a full isolated environment with packages and native command behavior. Flue connects provider environments through `SandboxFactory` and the public `createSandboxSessionEnv(...)` adapter.

A typical connector follows this contract:

```ts title="connectors/provider.ts"
import { createSandboxSessionEnv } from '@flue/runtime';
import type { SandboxApi, SandboxFactory, SessionEnv } from '@flue/runtime';

export function provider(api: SandboxApi): SandboxFactory {
  return {
    async createSessionEnv({ cwd }): Promise<SessionEnv> {
      return createSandboxSessionEnv(api, cwd ?? '/workspace');
    },
  };
}
```

In practice, a connector's `SandboxApi` wraps the provider SDK and implements shell execution and the filesystem operations used by `harness.fs`, `session.fs`, and the default model-facing tools. Use provider-native file APIs where possible, and forward command options such as working directory, environment values, and deadlines.

### Use the provider lifecycle from application code

Provider sandboxes are application-owned. Your code creates them, authorizes them, decides whether one sandbox is reused, and deletes or expires it according to provider and tenant policy. Flue adapts a sandbox; it does not automatically destroy remote resources when a session or workflow operation finishes.

A Daytona-style workflow illustrates the shape:

```ts title=".flue/workflows/isolated-review.ts"
import { Daytona } from '@daytona/sdk';
import { createAgent, type FlueContext } from '@flue/runtime';
import { daytona } from '../connectors/daytona';

type Env = {
  DAYTONA_API_KEY: string;
};

export async function run({ init, env }: FlueContext<unknown, Env>) {
  const client = new Daytona({ apiKey: env.DAYTONA_API_KEY });
  const sandbox = await client.create();

  try {
    const reviewer = createAgent(() => ({
      model: 'anthropic/claude-sonnet-4-6',
      sandbox: daytona(sandbox),
      cwd: '/workspace',
    }));

    const harness = await init(reviewer);
    const session = await harness.session();
    return await session.prompt('Inspect the supplied repository and identify failing tests.');
  } finally {
    await sandbox.delete();
  }
}
```

The connector recipe in this repository adapts an already initialized Daytona sandbox and forwards provider command timeouts. Other remote providers follow the same broad arrangement while differing in SDK APIs, startup time, image configuration, networking, and persistence behavior.

If an addressable agent must retain a remote workspace across later direct interactions, do not unconditionally delete that workspace at the end of one request. Establish an application-owned mapping and retention policy between stable agent instance identity, remote sandbox identity, tenant isolation, and cleanup.

### Design for deadlines and cancellation

`SandboxApi.exec(...)` receives two related controls:

| Option | Connector expectation |
| --- | --- |
| `timeout` in seconds | Primary deadline contract. Forward it to the provider's native command timeout when available. Model-selected bash commands rely on this behavior. |
| `signal` | Mid-flight cancellation when the provider SDK supports it. Signal-blind providers can generally observe cancellation only before or after their remote operation returns. |

`createSandboxSessionEnv(...)` performs abort checks around the connector call, but it cannot stop an already-running remote process in a provider that offers no cancellation primitive. Select timeouts and provider controls appropriate for expensive, destructive, or externally visible command work.

### Decide what persists in a remote environment

Do not assume that “remote sandbox” implies a particular lifetime. Depending on the provider and your configuration, a sandbox may be ephemeral, paused and resumable, attached to a durable volume, or destroyed after each operation. Determine separately:

- whether files must survive another operation, session, or process restart;
- whether a tenant receives one reusable workspace or a fresh sandbox per job;
- whether package installation and generated artifacts should be retained;
- how expired or failed sandboxes are cleaned up; and
- whether network egress and secrets belong in the sandbox at all.

## Choose among Cloudflare sandbox approaches

On the Cloudflare target, there are three distinct strategies. The default lightweight sandbox, a Cloudflare Shell Workspace connector, and a Cloudflare Sandbox Container are not interchangeable implementations of the same persistence or command model.

| Cloudflare strategy | Workspace and execution behavior | Choose it when… |
| --- | --- | --- |
| Default lightweight sandbox | Fresh in-memory `just-bash` filesystem and lightweight command tools; current generated configuration permits full network access. | Inputs are small or staged per initialization and neither durable files nor Linux tooling are required. |
| Project-owned Cloudflare Shell Workspace connector | Workspace-backed filesystem with a connector-provided JavaScript `code` tool; no ordinary `bash` execution surface. | Files should live in a durable Workspace and model work can be expressed through Workspace operations rather than Linux commands. |
| Cloudflare Sandbox Containers via `@cloudflare/sandbox` | Container-backed Linux execution with ordinary shell/filesystem behavior. | The agent needs Linux tooling, package installation, git, language runtimes, or a container environment. |

Use [Deploy on Cloudflare](/docs/ecosystem/deploy/cloudflare/) for Cloudflare target, bindings, and deployment setup rather than treating this guide as a deployment recipe.

## Use a project-owned Cloudflare Shell Workspace connector

Cloudflare Shell is a workspace-oriented option for Cloudflare applications that require durable files but do not require a conventional Linux shell. Install or generate the project-owned connector and import helpers from your connector file, such as `.flue/connectors/cloudflare-shell.ts` or `connectors/cloudflare-shell.ts` according to your source layout.

Do **not** import `getShellSandbox`, `getDefaultWorkspace`, or `hydrateFromBucket` from `@flue/runtime/cloudflare`. Those runtime helper implementations were removed; current Cloudflare Shell setup is connector-owned.

For a workspace that should survive later interactions, attach it to a stable addressable agent instance. In the generated Cloudflare runtime, direct input for the same agent instance `id` is handled by the same Durable Object owner, so a workspace backed by that owner's storage can reuse hydrated files:

```ts title=".flue/agents/knowledge-assistant.ts"
import { createAgent, type AgentRouteHandler } from '@flue/runtime';
import {
  getDefaultWorkspace,
  getShellSandbox,
  hydrateFromBucket,
} from '../connectors/cloudflare-shell';

type Env = {
  KNOWLEDGE_BASE: R2Bucket;
  LOADER: WorkerLoader;
};

export const route: AgentRouteHandler = async (_c, next) => next();

export default createAgent<unknown, Env>(async ({ env }) => {
  const workspace = getDefaultWorkspace();

  if (!(await workspace.exists('/.hydrated'))) {
    await hydrateFromBucket(workspace, env.KNOWLEDGE_BASE);
    await workspace.writeFile('/.hydrated', new Date().toISOString());
  }

  return {
    model: 'cloudflare/@cf/moonshotai/kimi-k2.6',
    sandbox: getShellSandbox({ workspace, loader: env.LOADER }),
    cwd: '/',
  };
});
```

A workflow can use the same connector, but each Cloudflare workflow invocation has its own `runId` and workflow Durable Object owner. A `getDefaultWorkspace()` created in a workflow is therefore durable for that workflow run's owner, not a reusable knowledge workspace shared by future workflow invocations; hydrate per run or provide an application-owned stable workspace identity when cross-run reuse is required.

The repository's Cloudflare Shell connector establishes these semantics:

| Surface | Connector behavior |
| --- | --- |
| `harness.fs` and `session.fs` | Read and write the same Cloudflare Shell `Workspace` filesystem. |
| Model-facing capability | A `code` tool executes JavaScript against the workspace `state.*` API through a Worker Loader-backed executor. |
| Default model file/shell tools | Replaced by that connector's `code` tool, rather than exposed as `read`, `write`, `grep`, `glob`, or `bash`. |
| `harness.shell(...)` / `session.shell(...)` | Throw because ordinary command execution is not supported by this connector. |
| Workspace storage | The default connector constructs `Workspace` on the owning Cloudflare context's SQL storage. |
| Hydration from R2 | An eager copy into Workspace, not a live mounted bucket. Later bucket changes do not automatically update workspace files. |

The generated connector's `code` execution environment is designed around Workspace access and declares outbound network unavailable within the `code` tool. This restriction belongs to that connector's tool; it does not change the network behavior of Flue's default lightweight sandbox.

The connector uses a Worker Loader binding and Cloudflare-specific dependencies. Keep binding setup and deployment details with your Cloudflare configuration; [Deploy on Cloudflare](/docs/ecosystem/deploy/cloudflare/) covers the broader target setup. Use [Skills](/docs/guide/skills/) when hydrating runtime workspace skills before initialization.

## Use Cloudflare Sandbox Containers for Linux execution

Use `@cloudflare/sandbox` on the Cloudflare target when the agent requires a container-backed Linux environment rather than Workspace code operations. It is a Cloudflare container/Durable Object integration, not a Node-hosted connector and not the Cloudflare Shell Workspace connector.

```ts title=".flue/agents/container-reviewer.ts"
import { getSandbox } from '@cloudflare/sandbox';
import { createAgent } from '@flue/runtime';

type Env = {
  Sandbox: DurableObjectNamespace;
};

export default createAgent<unknown, Env>(({ id, env }) => ({
  model: 'anthropic/claude-sonnet-4-6',
  sandbox: getSandbox(env.Sandbox, id),
  cwd: '/workspace',
}));
```

On a generated Cloudflare target, Flue recognizes the `getSandbox(...)` Durable Object RPC stub and adapts its filesystem and shell operations. This path does not use removed `@flue/runtime/cloudflare` workspace helper functions.

A Cloudflare Sandbox Container requires application-owned target setup at a high level:

1. install `@cloudflare/sandbox` in the Cloudflare-targeted project;
2. declare an appropriate sandbox Durable Object binding and container image in `wrangler.jsonc`;
3. provide the container image/Dockerfile and any required runtime tooling; and
4. choose stable sandbox identity, storage, egress, secrets, and retention policy for your application.

Flue's Cloudflare build integration auto-wires user-declared sandbox bindings whose configured class name ends with `Sandbox` to the `@cloudflare/sandbox` `Sandbox` class in its generated Worker entry. Refer to [Deploy on Cloudflare](/docs/ecosystem/deploy/cloudflare/#connecting-a-remote-sandbox) for concrete configuration and deployment instructions.

A container can provide native commands unavailable in the default environment or Cloudflare Shell connector, but it also expands the capability surface. Treat package managers, network egress, credentials, mounted data, and externally visible operations as security-sensitive; provide only what the agent needs.

## Choose a sandbox strategy

Begin with the narrowest environment that supports the task, then expand capabilities intentionally.

| Requirement | Recommended starting strategy | Primary caution |
| --- | --- | --- |
| Prompting plus a few application-supplied input files | Default lightweight sandbox with files staged through `harness.fs` before prompting. | Files are in-memory and not a durable workspace; current generated setup permits network access. |
| Basic scratch shell/file work without host access | Default lightweight sandbox. | Do not assume Linux binaries, host files, or durable artifacts. |
| Trusted Node CI job or local developer assistant operating on an existing checkout | Node `local()` with a deliberate `cwd`. | The agent can act on the real host filesystem and shell; explicitly limit env forwarding. |
| Multi-tenant or untrusted execution needing isolated Linux environments from a Node application | Remote sandbox connector, such as a Daytona-style `SandboxFactory`. | You own provisioning, authorization, cleanup, deadlines, egress, and durability choices. |
| Cloudflare application needing a durable file workspace and Workspace-oriented operations | Project-owned Cloudflare Shell Workspace connector. | The model receives `code`, not ordinary shell tools; hydration is copy-in, not a mounted bucket. |
| Cloudflare application needing git, packages, native tooling, or Linux shell behavior | Cloudflare Sandbox Container via `@cloudflare/sandbox`. | Configure and secure container bindings, image, storage, networking, and secrets. |

### Apply a practical decision sequence

1. **List required actions.** Does the agent only need staged documents, or must it run commands, install packages, clone repositories, or retain modified files?
2. **Locate the trust boundary.** If prompts or inputs are untrusted, do not choose Node `local()` merely because it is convenient. Prefer an isolated provider or container with deliberate credentials and egress policy.
3. **Choose filesystem lifetime separately from session lifetime.** Decide whether files must survive, then configure the sandbox/workspace accordingly; decide whether conversations must survive, then configure the session store accordingly.
4. **Prepare runtime context before initialization.** Put `AGENTS.md`, `CLAUDE.md`, or workspace skill files in the chosen sandbox under `cwd` before calling `init(...)` if they should be discovered for that harness.
5. **Verify the actual tool surface.** A connector may replace shell/file tools with a different model-facing interface. Write prompts against capabilities the selected sandbox exposes.
6. **Bound secrets and network effects.** Prefer narrow tools or controlled egress over exposing general credentials to model-selected commands.
7. **Treat lifecycle as application code.** For remote or persistent resources, decide creation, reuse, cleanup, retention, and recovery behavior rather than expecting Flue to manage it automatically.

## Continue configuring your application

- Use [Agents](/docs/guide/building-agents/) to configure addressable agents and continuing session state.
- Use [Workflows](/docs/guide/workflows/) to initialize configured agents and stage workspace inputs during finite orchestration.
- Use [Tools](/docs/guide/tools/) to restrict executable capabilities or understand connector-replaced model tools.
- Use [Project Layout](/docs/guide/project-layout/) to distinguish authored modules from runtime-discovered workspace context.
- Use [Models & Providers](/docs/guide/models/) to select models independently of the sandbox boundary.
- Use [Build & Deploy](/docs/guide/deployment/) to choose a target, then continue to [Deploy on Node.js](/docs/ecosystem/deploy/node/) or [Deploy on Cloudflare](/docs/ecosystem/deploy/cloudflare/).
- Use [Routing](/docs/guide/routing/) before exposing agents with filesystem or execution capability to application users.
- Use [`flue connect`](/docs/cli/connect/) for interactive local Node agent-instance sessions during development.
