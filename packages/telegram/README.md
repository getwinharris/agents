# @bapX/telegram

Verified Telegram Bot API webhook ingress for Bapx channels.

```ts
import { createTelegramChannel } from '@bapX/telegram';

export const channel = createTelegramChannel({
  secretToken: process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN!,
  webhook({ update }) {
    // Handle one verified Telegram Update.
  },
});
```

The package owns webhook secret verification, parsing, provider-native Update
pass-through, response handling, and canonical conversation identity.
Applications own the bot token, outbound Bot API client, tools, dispatch
policy, and update-id deduplication.

See the prepared package docs or <https://docs.bapx.in/ecosystem/channels/telegram/>.
