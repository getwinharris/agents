# @bapX/whatsapp

Verified WhatsApp Business Cloud webhook ingress for Flue channels.

```ts
import { createWhatsAppChannel } from '@bapX/whatsapp';

export const channel = createWhatsAppChannel({
  appSecret: process.env.WHATSAPP_APP_SECRET!,
  verifyToken: process.env.WHATSAPP_VERIFY_TOKEN!,
  webhook({ payload }) {
    // One verified Meta delivery; walk payload.entry[].changes[].
  },
});
```

The package owns GET verification, exact-body signature validation, and
forwarding Meta's provider-native webhook payload unmodified. Payload types come
from the community-maintained `@whatsapp-cloudapi/types` package. The channel
also provides canonical phone, Business-Scoped User ID, and group conversation
identity helpers. Applications own interpreting the payload,
filtering deliveries by business account or phone number, access tokens,
outbound clients, tools, dispatch policy, and deduplication.

See the prepared package docs or
<https://bapx.in/docs/ecosystem/channels/whatsapp/>.
