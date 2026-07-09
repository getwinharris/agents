# @bapX/messenger

Verified Facebook Messenger Page ingress for Bapx channels.

```ts
import { createMessengerChannel } from '@bapX/messenger';

export const channel = createMessengerChannel({
  appSecret: process.env.MESSENGER_APP_SECRET!,
  verifyToken: process.env.MESSENGER_VERIFY_TOKEN!,
  pageId: process.env.MESSENGER_PAGE_ID!,
  webhook({ payload }) {
    // Handle one verified, potentially batched, provider-native Page payload.
  },
});
```

The package owns verification, exact-body signatures, fixed Page identity, the
provider-native webhook payload, and canonical conversation identity.
Applications own Page access tokens, outbound Graph clients, tools, dispatch
policy, and deduplication.

See the prepared package docs or
<https://bapx.in/docs/ecosystem/channels/messenger/>.
