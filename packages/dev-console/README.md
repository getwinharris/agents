# `@flue/dev-console`

Experimental terminal client for interacting with a running Flue application.

This package is intentionally separate from `@flue/cli`. It does not discover projects, start a development server, load `.env` files, or temporarily expose route-free resources. Start the application separately and provide the absolute URL where its `flue()` routes are mounted.

## Usage

Start the application in one terminal:

```sh
pnpm exec flue dev
```

Attach in another terminal:

```sh
pnpm exec flue-dev-console agent:support --server http://127.0.0.1:3583
```

Resources must be qualified as `agent:<name>` or `workflow:<name>`.

```sh
pnpm exec flue-dev-console agent:support \
  --server http://127.0.0.1:3583/api/flue \
  --id support-demo

pnpm exec flue-dev-console workflow:deploy \
  --server http://127.0.0.1:3583/api/flue \
  --input '{"environment":"staging"}'
```

## Options

```text
--server <url>         Absolute URL of the mounted Flue application
--id <id>              Agent instance ID; generated when omitted
--input <json>         Initial agent input or workflow input
--token <token>        Bearer token sent with every request
--header 'Name: value' Repeatable request header
--help                 Show usage
--version              Show package version
```

For agents, `--input` must be a JSON object with a string `message` and optional `images`. The console stays open for follow-up prompts on the same agent instance. A workflow runs once and leaves a read-only transcript.

`@flue/dev-console` is experimental. Its command-line interface and presentation may change without notice.
