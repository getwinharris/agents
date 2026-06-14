---
title: Channels
description: Receive verified provider events and connect them to Flue agents.
---

A channel receives provider HTTP events, verifies and normalizes them, and lets
your application decide what happens next. Flue provides ingress packages for:

| Provider                   | Package                            | Discovered routes                                                                       |
| -------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------- |
| GitHub                     | `@flue/github`                     | `/channels/<file>/webhook`                                                              |
| Stripe                     | `@flue/stripe`                     | `/channels/<file>/webhook`                                                              |
| Notion                     | `@flue/notion`                     | `/channels/<file>/webhook`                                                              |
| Resend                     | `@flue/resend`                     | `/channels/<file>/webhook`                                                              |
| Shopify                    | `@flue/shopify`                    | `/channels/<file>/webhook`                                                              |
| Intercom                   | `@flue/intercom`                   | `/channels/<file>/webhook` (`HEAD`, `POST`)                                             |
| Zendesk                    | `@flue/zendesk`                    | `/channels/<file>/webhook`                                                              |
| Salesforce Marketing Cloud | `@flue/salesforce-marketing-cloud` | `/channels/<file>/events`                                                               |
| Slack                      | `@flue/slack`                      | `/channels/<file>/events`, `/channels/<file>/interactions`, `/channels/<file>/commands` |
| Discord                    | `@flue/discord`                    | `/channels/<file>/interactions`                                                         |
| Teams                      | `@flue/teams`                      | `/channels/<file>/activities`                                                           |
| Google Chat                | `@flue/google-chat`                | `/channels/<file>/interactions`, `/channels/<file>/events`                              |
| Linear                     | `@flue/linear`                     | `/channels/<file>/webhook`                                                              |
| Telegram                   | `@flue/telegram`                   | `/channels/<file>/webhook`                                                              |
| WhatsApp                   | `@flue/whatsapp`                   | `/channels/<file>/webhook`                                                              |
| Twilio                     | `@flue/twilio`                     | `/channels/<file>/webhook`, `/channels/<file>/status`                                   |
| Messenger                  | `@flue/messenger`                  | `/channels/<file>/webhook`                                                              |

The packages own signature verification, body limits, provider handshakes,
identity checks, typed event normalization, and acknowledgement behavior. They
do not wrap outbound provider APIs or supply generic model tools.

## Add a provider

Use `flue add` to give your coding agent the complete integration recipe:

```sh
flue add github --print | codex
flue add stripe --print | codex
flue add notion --print | codex
flue add resend --print | codex
flue add shopify --print | codex
flue add intercom --print | codex
flue add zendesk --print | codex
flue add salesforce-marketing-cloud --print | codex
flue add slack --print | codex
flue add discord --print | codex
flue add teams --print | codex
flue add google-chat --print | codex
flue add linear --print | codex
flue add telegram --print | codex
flue add whatsapp --print | codex
flue add twilio --print | codex
flue add messenger --print | codex
```

The recipe installs the ingress package and an established provider SDK or
narrow Fetch client, then creates an editable `channels/<provider>.ts` module
that exports:

- `channel`, the verified inbound integration discovered by Flue;
- `client`, the project-owned provider SDK client;
- any narrow `defineTool(...)` values justified by your application.

For another provider, start from its documentation:

```sh
flue add https://provider.example/webhooks --category channel --print | codex
```

See the provider guides for [GitHub](/docs/guide/channels/github/),
[Stripe](/docs/guide/channels/stripe/),
[Notion](/docs/guide/channels/notion/),
[Resend](/docs/guide/channels/resend/),
[Shopify](/docs/guide/channels/shopify/),
[Intercom](/docs/guide/channels/intercom/),
[Zendesk](/docs/guide/channels/zendesk/),
[Salesforce Marketing Cloud](/docs/guide/channels/salesforce-marketing-cloud/),
[Slack](/docs/guide/channels/slack/),
[Discord](/docs/guide/channels/discord/),
[Microsoft Teams](/docs/guide/channels/teams/),
[Google Chat](/docs/guide/channels/google-chat/),
[Linear](/docs/guide/channels/linear/),
[Telegram](/docs/guide/channels/telegram/),
[WhatsApp](/docs/guide/channels/whatsapp/),
[Twilio](/docs/guide/channels/twilio/),
[Facebook Messenger](/docs/guide/channels/messenger/), or
[build a custom channel](/docs/guide/build-your-own-channel/).

## File-based routing

Each immediate file beneath `channels/` exports one named `channel` binding:

```txt
src/channels/github.ts  -> /channels/github/webhook
src/channels/stripe.ts  -> /channels/stripe/webhook
src/channels/notion.ts  -> /channels/notion/webhook
src/channels/resend.ts  -> /channels/resend/webhook
src/channels/shopify.ts -> /channels/shopify/webhook
src/channels/intercom.ts
                         -> /channels/intercom/webhook (HEAD, POST)
src/channels/zendesk.ts  -> /channels/zendesk/webhook
src/channels/salesforce-marketing-cloud.ts
                         -> /channels/salesforce-marketing-cloud/events
src/channels/slack.ts   -> /channels/slack/events
                          /channels/slack/interactions
                          /channels/slack/commands
src/channels/teams.ts   -> /channels/teams/activities
src/channels/google-chat.ts
                        -> /channels/google-chat/interactions
                           /channels/google-chat/events
src/channels/linear.ts   -> /channels/linear/webhook
src/channels/telegram.ts -> /channels/telegram/webhook
src/channels/whatsapp.ts -> /channels/whatsapp/webhook
src/channels/twilio.ts   -> /channels/twilio/webhook
                            /channels/twilio/status
src/channels/messenger.ts
                         -> /channels/messenger/webhook
```

The filename defines the channel namespace. Provider packages define fixed,
non-empty route suffixes. The namespace itself, such as `/channels/github`, is
not an endpoint.

No `app.ts` is required. If an authored application mounts `flue()` beneath an
outer prefix, channels receive that prefix with agents and workflows:

```ts
app.route('/api', flue());
```

publishes `/api/channels/github/webhook`. An authored application cannot move
one discovered channel independently.

Generated channel modules include an exact default path comment immediately
above each handler:

```ts
// Path: /channels/github/webhook
async webhook({ event }) {
  // ...
}
```

## Handle verified events

The constructor receives one callback per provider protocol surface. The
callback runs only after verification and normalization:

```ts
export const channel = createGitHubChannel({
  webhookSecret: process.env.GITHUB_WEBHOOK_SECRET!,

  // Path: /channels/github/webhook
  async webhook({ c, event }) {
    switch (event.type) {
      case 'issues.opened':
      case 'pull_request.opened':
        await dispatch(assistant, {
          id: channel.conversationKey({
            owner: event.repository.owner,
            repo: event.repository.name,
            issueNumber:
              event.type === 'issues.opened'
                ? event.payload.issue.number
                : event.payload.pullRequest.number,
          }),
          input: {
            type: `github.${event.type}`,
            deliveryId: event.deliveryId,
          },
        });
        return;
      default:
        return;
    }
  },
});
```

The callback receives the authentic Hono context as `c`. Return `c.json(...)`,
`c.text(...)`, or another `Response` for full response control. A plain
JSON-compatible return value becomes a JSON response. When the provider allows
an empty acknowledgement, returning nothing produces an empty `200`.

Slack surfaces are optional: omitting `events`, `interactions`, or `commands`
means that route is not published. Discord interactions require a provider
response.

## Own the SDK and tools

Provider APIs are broad and provider-specific. Initialize the established SDK
in project code, export it, and define only the tools your agent needs:

```ts
export const client = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

export function commentOnIssue(ref: GitHubIssueRef) {
  return defineTool({
    name: 'comment_on_github_issue',
    description: 'Comment on the GitHub issue bound to this agent.',
    parameters: v.object({ body: v.string() }),
    async execute({ body }) {
      await client.rest.issues.createComment({
        owner: ref.owner,
        repo: ref.repo,
        issue_number: ref.issueNumber,
        body,
      });
      return 'Comment posted.';
    },
  });
}
```

Bind credentials and destinations in trusted application code. Let the model
select only the content or intentionally variable options. Conversation keys
identify destinations; they do not authorize caller-selected agent ids.

## Acknowledgement and replay

Channel packages are stateless and do not deduplicate deliveries.

| Provider                | Failure behavior                                                               |
| ----------------------- | ------------------------------------------------------------------------------ |
| GitHub                  | Failed deliveries can be inspected and manually redelivered.                   |
| Stripe                  | Failed live deliveries retry for up to three days; ordering is not guaranteed. |
| Resend                  | Delivery is at least once; use `svix-id` for application-owned deduplication.  |
| Shopify                 | Retries run for four hours; deduplicate with the webhook id.                   |
| Intercom                | Failed delivery retries once; use notification id for application dedupe.      |
| Zendesk                 | Selected failures and timeouts retry; deduplicate with the signed event id.    |
| Slack Events API        | Slack may retry and supplies retry metadata.                                   |
| Slack interactivity     | Requires a prompt acknowledgement and is not a dependable retry queue.         |
| Discord interactions    | Failures are user-visible and do not provide dependable redelivery.            |
| Teams activities        | Use `activityId` when the application needs duplicate protection.              |
| Google Chat direct      | Failed callbacks can be retried; use provider event identity as needed.        |
| Google Workspace Events | Pub/Sub retries unacknowledged push messages.                                  |
| Linear                  | Failed or late acknowledgements can be retried.                                |
| Telegram                | Telegram retries unsuccessful webhook requests.                                |
| WhatsApp                | Meta retries failed signed deliveries for up to seven days.                    |
| Twilio Messaging        | Webhooks and status callbacks can be retried and expose stable ids.            |
| Facebook Messenger      | Meta retries failed Page deliveries and may change ordering.                   |

Handlers wait for application work such as `dispatch(...)` admission before
acknowledging. Deadlines cannot forcibly stop arbitrary callback code. Claim a
delivery or interaction id in application-owned durable storage when duplicate
admission is unacceptable.

Keep raw payloads, credentials, Slack `response_url` values, Discord
interaction tokens, and other short-lived capabilities out of model context,
logs, dispatched input, and durable session history.

## Targets

The first-party ingress packages use Fetch and Web Crypto and are tested on
Node and workerd. Flue Cloudflare builds require `nodejs_compat`, so recipes may
use SDKs whose required Node APIs are implemented there. Outbound compatibility
is still operation-specific: execute the selected client path in workerd rather
than treating a successful bundle as proof.
