# Bapx with vitest-evals

This example evaluates an HTTP-exposed Bapx agent through a custom `vitest-evals` harness.

Set `ANTHROPIC_API_KEY`, then start the Bapx server:

```sh
pnpm --filter example-vitest-evals dev
```

In another terminal, run the eval:

```sh
pnpm --filter example-vitest-evals evals
```

Use `evals:info` for detailed tool and usage output, or `evals:json` to write `vitest-results.json` for CI and the local report UI. Set `FLUE_BASE_URL` to evaluate a deployed Bapx application instead of the local server.

The harness creates a fresh agent instance for each case, invokes it through `@bapX/sdk`, and converts the response, token usage, and tool events into the normalized `vitest-evals` result.
