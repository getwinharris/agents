# Chat SDK with Bapx

This example uses Chat SDK for bidirectional GitHub issue-comment messaging while Bapx owns agent execution.

```txt
signed GitHub issue_comment webhook
  -> Chat SDK GitHub adapter
  -> dispatch(assistant, ...)
  -> Bapx agent tool
  -> bot.thread(threadId).post(...)
  -> fake local GitHub comment API
```

The fixture uses Chat SDK's in-memory state adapter and a scripted model provider so its end-to-end test is local and deterministic. Use persistent Chat SDK state for production integrations.

## Run on Node

```sh
node ../../packages/cli/bin/bapX.mjs dev --target node --port 3585
node ./test/e2e.mjs
```

## Run on Cloudflare

```sh
node ../../packages/cli/bin/bapX.mjs dev --target cloudflare --port 3585
node ./test/e2e.mjs
```
