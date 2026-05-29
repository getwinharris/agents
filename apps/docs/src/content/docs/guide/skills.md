---
title: Skills
description: Package reusable instructions and resources that agents can activate when needed.
---

## What is a skill?

A skill is a reusable, named set of instructions and supporting files that an agent can apply to a particular kind of work. Use a skill when several operations should follow the same procedure, rubric, domain guidance, templates, or reference material.

A skill is not an executable tool:

| Capability | Provides | Use it when |
| --- | --- | --- |
| **Skill** | Markdown instructions and optional resources that guide the model through work. | The model needs a reusable workflow, review checklist, policy, examples, or reference files. |
| **Tool** | Executable behavior with parameters and an implementation that returns a result. | The model must call application code, an API, a filesystem action, or another deterministic capability. |

For example, a `review-pr` skill can tell an agent what to inspect and include `references/security.md`. A `get-pull-request` tool can fetch the pull request data. A skill can instruct the model to use available tools, but adding a skill does not implement a new tool.

This guide shows how to:

1. Add a workspace skill that a session discovers from its sandbox.
2. Import a source-owned skill into an application build.
3. Activate either form with `session.skill(...)`.
4. Pass arguments and require structured results.
5. Package supporting resources without unintentionally deploying secrets.

See [Tools](/docs/guide/tools/) for executable capabilities, [Agents](/docs/guide/building-agents/) for runtime context discovery, [Workflows](/docs/guide/workflows/) for initialized environments and sessions, [Prompting](/docs/guide/prompting/) for operation results, and [Project Layout](/docs/guide/project-layout/) for authored modules versus runtime workspace context.

## Choose workspace discovery or an imported skill

Flue supports two ways to make skills available. Choose based on where the skill should live at runtime.

| Approach | Source location | How it becomes available | Activate it with |
| --- | --- | --- | --- |
| Workspace skill | `<cwd>/.agents/skills/<name>/SKILL.md` inside the runtime sandbox | Discovered when context initializes for a harness/session working directory | `session.skill('<name>')` |
| Imported packaged skill | Any application-owned skill directory inside the project root, imported statically from a TypeScript module | Included as a build dependency and represented by a `SkillReference` | `session.skill(reference)` or register it in `skills` and call `session.skill('<name>')` |

Workspace skills are useful when the workspace supplies capabilities at runtime: a host-backed project directory, a hydrated Cloudflare workspace, or another sandbox populated before initialization. Imported skills are useful when a deployed application must carry known, source-owned instructions and resources regardless of the runtime workspace.

Do not confuse a workspace skill directory with Flue's authored source modules. For example, `.flue/agents/assistant.ts` and `.flue/workflows/review.ts` are discovered as application source during development and build. A runtime skill is discovered only at `<cwd>/.agents/skills/...` in the initialized agent's sandbox. An imported skill can be stored under `.flue/skills/` for convenient source organization, but it becomes available because it is imported, not because `.flue/skills/` is a runtime discovery path.

## Create a workspace skill

Create one directory per skill under the working directory that your agent will see in its sandbox:

```text title="Workspace skill layout"
<cwd>/
└─ .agents/
   └─ skills/
      └─ summarize-incident/
         ├─ SKILL.md
         └─ references/
            └─ severity-guide.md
```

Add frontmatter and procedural instructions to `SKILL.md`:

```md title="<cwd>/.agents/skills/summarize-incident/SKILL.md"
---
name: summarize-incident
description: Summarize an incident report with impact, timeline, and follow-up actions.
license: Apache-2.0
compatibility: Requires access to the incident report in the active workspace.
metadata:
  owner: reliability
  version: "1.0"
---

Create an incident summary for the report identified in the arguments.

Read `references/severity-guide.md` when assigning severity. Return a concise impact statement, a chronological timeline, and concrete follow-up actions.
```

Place any material the instructions may need beside `SKILL.md`, such as checklists, templates, scripts, or assets. For a workspace skill, these files remain in the sandbox workspace. The agent can consume them when its configured filesystem or execution tools permit that access.

### Frontmatter requirements

A `SKILL.md` file starts and ends its YAML frontmatter with `---`. Flue validates frontmatter when a workspace skill is discovered and when an imported skill is packaged.

| Field | Required | Supported value and validation |
| --- | --- | --- |
| `name` | Yes | Non-empty string, at most 64 characters. Must match its containing directory name exactly. May contain lowercase letters, digits, and single internal hyphens only, such as `review-pr` or `pdf2-text`. |
| `description` | Yes | Non-empty string, at most 1024 characters. Describe when the skill is useful so the model can choose it from the available catalog. |
| `license` | No | Non-empty string when supplied. |
| `compatibility` | No | Non-empty string when supplied, at most 500 characters. |
| `metadata` | No | YAML mapping whose values are strings. Quote values such as versions that YAML would otherwise parse as numbers. |
| `allowed-tools` | No | Space-separated string of tool names or patterns, parsed as skill metadata. |

Valid names include `greet`, `review-pr`, and `pdf2-text`. Names such as `Review`, `-review`, `review-`, and `review--pr` are rejected. This directory and frontmatter must agree:

```text title="Valid skill name and directory"
.agents/skills/review-pr/SKILL.md    name: review-pr
```

```text title="Invalid skill name and directory"
.agents/skills/review/SKILL.md       name: review-pr
```

`allowed-tools` is currently parsed from frontmatter but is not used by the Flue runtime to restrict available tools. Configure the agent's tools and sandbox boundary explicitly rather than relying on that field for enforcement.

### Write activation-friendly instructions

A useful skill is specific about the task but does not assume data that has not been passed or made accessible. In practice:

- Give the skill one clear responsibility and a description that makes selection unambiguous.
- Refer to arguments by purpose, such as “the incident identifier provided in the arguments.”
- State when a supporting file must be read and what decision it informs.
- Put long policies and examples in resource files instead of expanding the activated instructions unnecessarily.
- Keep credentials and private data out of the skill directory, especially when the skill may be bundled into a deployment.

## Discover workspace skills at runtime

Workspace discovery is based on the agent's runtime working directory, not the source file containing `createAgent(...)`. When context initializes, Flue looks in:

```text title="Runtime discovery convention"
<cwd>/.agents/skills/<name>/SKILL.md
```

`<cwd>` is the working directory in the session's sandbox. Therefore, a skill file in your source checkout is available only if the initialized runtime sandbox exposes that directory as its working directory or you populate the sandbox before calling `init()`.

```ts title=".flue/workflows/with-workspace-skill.ts"
import { createAgent, type FlueContext } from '@flue/runtime';
import { local } from '@flue/runtime/node';

const agent = createAgent(() => ({
  sandbox: local(),
  cwd: process.cwd(),
  model: 'anthropic/claude-sonnet-4-6',
}));

export async function run({ init }: FlueContext) {
  const harness = await init(agent);
  const session = await harness.session();
  const response = await session.skill('summarize-incident', {
    args: { incidentId: 'INC-1042' },
  });

  return response.text;
}
```

The chosen `sandbox` and `cwd` must be appropriate for your deployment target. See [Agents](/docs/guide/building-agents/), [Sandboxes](/docs/guide/sandboxes/), and [Project Layout](/docs/guide/project-layout/) before depending on host or hydrated workspace files.

### What discovery loads

At context initialization, Flue reads and validates workspace skill frontmatter and places each skill's `name` and `description` into the session's available-skill catalog. It intentionally does not retain the skill body in that catalog.

This keeps detailed instructions and sibling resources lazy:

1. Context initialization exposes small identifying metadata so the model knows which capabilities exist.
2. `session.skill('summarize-incident', ...)` activates a registered skill by name.
3. For a workspace skill, the model reads the `SKILL.md` instructions and any referenced sibling files from the active workspace when needed.

This design also means edits to a workspace skill body or its resources can be read during subsequent operations without rebuilding an application. If you add or rename a workspace skill after initialization, initialize context again so its `name` and `description` enter the available catalog.

### Populate a sandbox before initialization

If runtime content comes from storage or another preparation step, ensure `.agents/skills/<name>/SKILL.md` is present before `init()` discovers context. For example, a Cloudflare workspace can be hydrated from R2 into the conventional directory and then passed through its sandbox connector:

```ts title="Hydrate a runtime workspace before discovery"
await hydrateFromBucket(workspace, env.KNOWLEDGE_BASE);

const agent = createAgent(() => ({
  sandbox: getShellSandbox({ workspace, loader: env.LOADER }),
  model: 'cloudflare/@cf/moonshotai/kimi-k2.6',
}));

const harness = await init(agent);
const session = await harness.session();
const result = await session.skill('spam-filter', {
  args: { message: payload.message },
  result: v.object({ spam: v.boolean(), reason: v.string() }),
});
```

In that case, the hydrated workspace must contain `.agents/skills/spam-filter/SKILL.md` at the sandbox working directory. A default empty sandbox does not gain skills merely because matching files exist in the application repository.

## Invoke a discovered skill by name

Activate a workspace-discovered skill by its registered frontmatter name. The string passed to `session.skill(...)` is a registered name, not a file path.

```ts title="Invoke a discovered skill with arguments and structured output"
import { createAgent, type FlueContext } from '@flue/runtime';
import { local } from '@flue/runtime/node';
import * as v from 'valibot';

const agent = createAgent(() => ({
  sandbox: local(),
  cwd: process.cwd(),
  model: 'anthropic/claude-sonnet-4-6',
}));

export async function run({ init, payload }: FlueContext<{ incidentId: string }>) {
  const harness = await init(agent);
  const session = await harness.session();

  const response = await session.skill('summarize-incident', {
    args: { incidentId: payload.incidentId, audience: 'engineering' },
    result: v.object({
      severity: v.picklist(['low', 'medium', 'high', 'critical']),
      impact: v.string(),
      timeline: v.array(v.string()),
      actions: v.array(v.string()),
    }),
  });

  return response.data;
}
```

`args` accepts a record of values. Flue includes those arguments in the activated skill operation so the instructions can apply to the requested input.

When you provide a `result` schema, Flue requires the operation to finish with a value validated against that schema. The returned response includes validated `data`, plus operation metadata:

```ts title="Consume skill result data and response metadata"
const response = await session.skill('summarize-incident', {
  args: { incidentId: 'INC-1042' },
  result: v.object({ impact: v.string(), actions: v.array(v.string()) }),
});

const impact: string = response.data.impact;
const actions: string[] = response.data.actions;
const selectedModel = response.model.id;
const tokens = response.usage.totalTokens;
```

Without `result`, the operation returns generated text together with model and usage metadata:

```ts title="Consume a text skill response"
const response = await session.skill('summarize-incident', {
  args: { incidentId: 'INC-1042' },
});

return { summary: response.text, model: response.model.id };
```

Do not activate workspace skills with a string path:

```ts title="Use the registered name, not a path"
await session.skill('summarize-incident');
```

A call such as `session.skill('.agents/skills/summarize-incident/SKILL.md')` is not a supported path-based activation API; it attempts to find a registered skill with that literal name and fails.

## Bundle a skill with an application

Use an imported packaged skill when its instructions and resources are part of application source and must ship with the built Node or Cloudflare application. The skill directory can be organized with your authored files, for example:

```text title="Source-owned imported skill layout"
.flue/
├─ skills/
│  └─ review/
│     ├─ SKILL.md
│     ├─ CHECKLIST.txt
│     └─ references/
│        └─ secure-coding.md
└─ workflows/
   └─ with-imported-skill.ts
```

Import `SKILL.md` statically with the `skill` import attribute:

```ts title=".flue/workflows/with-imported-skill.ts"
import { createAgent, type FlueContext } from '@flue/runtime';
import review from '../skills/review/SKILL.md' with { type: 'skill' };

const agent = createAgent(() => ({
  model: 'anthropic/claude-sonnet-4-6',
  skills: [review],
}));

export async function run({ init }: FlueContext) {
  const harness = await init(agent);
  const session = await harness.session();
  const response = await session.skill('review', {
    args: { focus: 'authentication changes' },
  });

  return response.text;
}
```

A static imported value is a lightweight `SkillReference` containing identity metadata, rather than the instruction body or supporting file contents. The Vite-based Flue build validates `SKILL.md` and packages the permitted files in that skill directory for lazy access at runtime.

Only static attributed imports are supported:

```ts title="Import a packaged skill reference"
import review from '../skills/review/SKILL.md' with { type: 'skill' };
```

Do not use an un-attributed `SKILL.md` import, a dynamic import, or a presumed `defineSkill()` function. Skills are authored in `SKILL.md` and made build dependencies through the static attributed import.

### Activate an imported reference directly

Pass an imported reference directly when code already holds the reference and only that skill operation needs access to its packaged resources:

```ts title="Direct packaged skill activation"
import { createAgent, type FlueContext } from '@flue/runtime';
import review from '../skills/review/SKILL.md' with { type: 'skill' };
import * as v from 'valibot';

const agent = createAgent(() => ({
  model: 'anthropic/claude-sonnet-4-6',
}));

export async function run({ init }: FlueContext) {
  const harness = await init(agent);
  const session = await harness.session();

  const response = await session.skill(review, {
    args: { artifact: 'release plan' },
    result: v.object({
      approved: v.boolean(),
      findings: v.array(v.string()),
    }),
  });

  return response.data;
}
```

During direct activation, Flue loads the packaged `SKILL.md` instructions for that operation and makes that reference's packaged resource files readable when needed.

### Register an imported reference for named activation

Register a reference in the agent's `skills` array if operations should activate it by its declared name or if ordinary work in that agent should be aware of the registered packaged skill:

```ts title="Register and activate a packaged skill by name"
import { createAgent, type FlueContext } from '@flue/runtime';
import review from '../skills/review/SKILL.md' with { type: 'skill' };

const agent = createAgent(() => ({
  model: 'anthropic/claude-sonnet-4-6',
  skills: [review],
}));

export async function run({ init }: FlueContext) {
  const harness = await init(agent);
  const session = await harness.session();
  return session.skill('review', { args: { artifact: 'API design' } });
}
```

Registering imported skills merges them into the session's skill catalog. A name collision between a registered application skill and a workspace-discovered skill is rejected rather than silently choosing one.

Merely importing a `SkillReference` does not expose its packaged files to unrelated `session.prompt(...)` operations. Either directly activate that reference with `session.skill(review)`, or register it in `skills: [review]` when its packaged capability should be available through the agent's catalog.

## Include supporting resources safely

Instructions can direct the model to consult sibling files only as needed:

```md title=".flue/skills/review/SKILL.md"
---
name: review
description: Review an artifact using packaged engineering guidance.
---

Read `CHECKLIST.txt` before reviewing the artifact in the arguments.
Read `references/secure-coding.md` when the artifact changes authentication, authorization, or secret handling.
Return findings ordered from highest to lowest risk.
```

For an imported skill, Flue packages permitted files throughout the complete skill directory, not only conventional `scripts/`, `references/`, or `assets/` folders. When the skill is activated, its `SKILL.md` body is put into the operation context; the operation is told which supporting resources are available, while their contents remain unread until needed.

| Resource type | Example | Practical use |
| --- | --- | --- |
| Reference material | `references/secure-coding.md` | Detailed policies or evaluation rubrics. |
| Template | `templates/report.md` | A required output shape or example document. |
| Data asset | `assets/categories.json` | Stable lookup material used while applying instructions. |
| Script | `scripts/check.ts` | A helper that instructions may ask the agent to run if suitable execution tools are available. |
| License or notice | `LICENSE.txt` | Terms shipped with the packaged skill. |

A bundled resource does not run automatically. It is an available file; the skill instructions and available tools determine whether and how the model reads or executes it.

### Packaging boundaries and secret safety

A static skill import deploys files from its skill directory. Treat that directory as application package content.

| Build behavior | Files or directories |
| --- | --- |
| Packaged when present | `SKILL.md` and ordinary nested text or binary resources, including ordinary hidden files. |
| Excluded as generated or repository content | `.git/`, `.cache/`, `.turbo/`, `.wrangler/`, `dist/`, `node_modules/`, `.DS_Store`, swap files, and editor backup files. |
| Rejected as sensitive | `.env`, `.env.*`, `.dev.vars`, `.dev.vars.*`, `.npmrc`, `.netrc`, `_netrc`, `.pypirc`, `credentials.json`, files ending in `.key`, `.pem`, `.p12`, or `.pfx`, files named `secret`, `secrets`, `secret.*`, or `secrets.*`, and content under `.aws/`, `.ssh/`, or `.gnupg/`. |
| Rejected for boundary safety | Symbolic links inside the imported skill directory, skill imports outside the project root, or imports traversing symbolic-link directories. |

Large resource files increase the deployed artifact size; the build warns for a packaged skill file larger than 1 MB. The sensitive-file rejection list is a defense against common mistakes, not a secret scanner: other names such as `.envrc` or `secret-token` are not covered by these filename rules. Prefer concise, stable guidance and keep runtime or private data in an explicitly controlled store outside an imported skill directory.

For workspace skills, the contents are not bundled by a static import, but the sandbox still defines what the agent can read or execute. Store sensitive material separately and grant only the filesystem and tool access needed for the operation.

## A complete reusable skill workflow

The following workflow packages a `release-review` skill, registers it by name, passes invocation-specific inputs, and consumes validated output.

```md title=".flue/skills/release-review/SKILL.md"
---
name: release-review
description: Check a proposed release against packaging and operational readiness requirements.
license: MIT
metadata:
  owner: platform
  version: "1.0"
---

Review the release identified in the arguments.

Read `references/readiness.md` before deciding whether the release is ready. Report blocking issues separately from non-blocking follow-up work. Do not approve a release with an unresolved blocking issue.
```

```md title=".flue/skills/release-review/references/readiness.md"
# Readiness checklist

- Confirm tests and type checks completed successfully.
- Confirm configuration and deployment changes are documented.
- Confirm the packaged artifacts contain no credentials or private keys.
```

```ts title=".flue/workflows/review-release.ts"
import { createAgent, type FlueContext } from '@flue/runtime';
import releaseReview from '../skills/release-review/SKILL.md' with { type: 'skill' };
import * as v from 'valibot';

const agent = createAgent(() => ({
  model: 'anthropic/claude-sonnet-4-6',
  skills: [releaseReview],
}));

export async function run({ init, payload }: FlueContext<{ version: string; evidence: string }>) {
  const harness = await init(agent);
  const session = await harness.session();

  const response = await session.skill('release-review', {
    args: {
      version: payload.version,
      evidence: payload.evidence,
    },
    result: v.object({
      ready: v.boolean(),
      blockers: v.array(v.string()),
      followUps: v.array(v.string()),
    }),
  });

  return {
    version: payload.version,
    review: response.data,
    model: response.model.id,
    tokens: response.usage.totalTokens,
  };
}
```

This arrangement keeps the reusable review process and its checklist together, while leaving each invocation responsible for supplying the release-specific evidence.

## Troubleshoot skill activation

| Symptom | Check |
| --- | --- |
| `Skill "..." not registered` when calling by name | For workspace skills, confirm `<cwd>/.agents/skills/<name>/SKILL.md` existed inside the sandbox before initialization. For imported skills, register the reference in `skills: [reference]` or activate the reference directly. |
| A skill file next to application source is not discovered | Workspace discovery follows the runtime sandbox `cwd`, not the application source tree. Expose or hydrate the workspace, or use a static packaged import. |
| Frontmatter validation fails | Confirm YAML delimiters, required `name` and `description`, directory/name equality, lowercase-hyphenated name rules, and string-valued `metadata`. |
| A packaged resource is unavailable in an unrelated prompt | Importing alone does not expose files. Activate the reference for that operation or register it with the agent. |
| A build rejects a skill directory | Remove secrets, key material, symlinks, or out-of-project imports from the packaged directory. |
| The model needs an action that instructions cannot perform | Provide an appropriate executable [tool](/docs/guide/tools/) or sandbox capability; a skill supplies guidance, not an implementation. |

## Related guides

- [Agents](/docs/guide/building-agents/) — configure agents and understand runtime context discovery.
- [Workflows](/docs/guide/workflows/) — initialize configured agents and use sessions during finite orchestration.
- [Tools](/docs/guide/tools/) — provide executable, model-callable capabilities that skills may direct an agent to use.
- [Prompting](/docs/guide/prompting/) — consume text, structured data, usage, models, and cancellation behavior from operations.
- [Project Layout](/docs/guide/project-layout/) — distinguish authored `.flue/` source from runtime workspace files and choose a source layout.
