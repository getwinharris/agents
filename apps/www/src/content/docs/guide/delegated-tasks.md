---
title: Delegated tasks and approvals
description: Durable background work, evidence, connectors, and workspace authorization in bapX Agents.
---

The main bapX agent owns the conversation. It submits bounded background work to the named `research`, `engineering`, or `verification` specialist profile and continues responding without waiting for completion. Specialists publish structured results rather than arbitrary assistant messages.

Every task is scoped to the authenticated account, business workspace, and parent session. Its durable record contains a monotonic version, least-privilege permissions, state history, attempts and leases, progress, approval state, evidence, artifacts, verification state, and a SHA-256 result digest. Stale or duplicate updates are rejected. Expired worker leases return to `queued` during recovery.

The Agents Threads page exposes current task, approval, evidence, and verification state. Admin uses the same operating model for the bapX workspace, with repository and user-management extensions, but does not automatically inherit customer task contents, connector secrets, or approval authority.

## Connector ownership

Platform is the connector control plane. It lists the repository's customer-facing model providers, channels, data services, sandboxes, infrastructure, and observability integrations. Agents can use only connections authorized for its selected business workspace.

OpenAI is a model-provider connector using device/account OAuth. Platform starts the flow and displays the OpenAI verification URL and user code for consent on your device. bapX does not request or persist an OpenAI API key for this flow. OAuth credentials are encrypted inside the business-workspace credential boundary and are never returned by status APIs or telemetry.

Connected OpenAI workspaces currently resolve `openai-codex/gpt-5.6-sol`. The `provider/model` routing contract remains provider-neutral.

## The specialists

Each one is least-privilege. A specialist is only ever given the permissions
its role needs, which is why the roles are separate at all.

| Specialist | Can | Cannot |
| --- | --- | --- |
| `research` | read the workspace, read the web | write anything |
| `engineering` | read and write the workspace, run project commands | publish or deploy |
| `verification` | read the workspace, run tests | modify what it reviews |

`verification` is deliberately unable to change the implementation it checks.
A specialist that can edit the thing it is verifying is not verification.

## Task states

```
queued ──► accepted ──► running ──► succeeded
   │                       │
   │                       ├──► failed
   │                       └──► waiting_approval ──► queued
   └──► cancelled / expired
```

A task needing approval starts in `waiting_approval` and **never executes
until approved**. Approval is recorded against the authenticated account, not
against a name supplied in the request.

## Following a task

```bash
curl -H "Authorization: Bearer $BAPX_API_KEY" \
  https://agents.bapx.in/api/orchestration/tasks/$TASK_ID
```

Every state change appends an event, so the history is auditable rather than
only the current state.

## Results and evidence

A finished task carries a summary, its **evidence**, and a verification state:

```json
{
  "state": "succeeded",
  "result": {
    "summary": "Three sources support the change",
    "evidence": [ { "type": "source", "detail": "docs/platform/api.md" } ],
    "verification": { "state": "unverified", "reason": "The specialist returned no evidence." },
    "integrity": { "algorithm": "sha256", "digest": "…" }
  }
}
```

**`verification` is not a formality.** A specialist that reports success
without evidence is recorded `unverified`, whatever it claims about itself.
Read `succeeded` as "the specialist finished" and `verification.state` as
"someone checked". They are different questions.

## Failure and retry

A failed attempt returns the task to the queue and it is retried. After the
attempt limit it is recorded `failed` with the cause. Errors that cannot
improve on a retry — an unknown profile, an unconfigured runtime — fail
immediately rather than consuming attempts.

If the worker holding a task dies, its lease expires and the task returns to
`queued` for another worker to pick up.

## Current limits

Submission, durability, approval gating, lease recovery and reporting are
live. **Model-backed specialist execution is not connected yet**: a submitted
task is accepted and durable, then fails with `Specialist execution is not
wired to a model yet`.

That is deliberate. A task that reports progress and quietly does nothing is
worse than one that tells you it cannot run.

## See also

- [Subagents](/docs/guide/subagents/) — defining specialist profiles
- [Platform API](/docs/platform/api/) — keys and the supported endpoints
