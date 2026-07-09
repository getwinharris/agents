# `@bapX/intercom`

Verified Intercom webhook ingress for Bapx channels.

```ts
import { createIntercomChannel } from '@bapX/intercom';

export const channel = createIntercomChannel({
  clientSecret: process.env.INTERCOM_CLIENT_SECRET,

  // Path: /channels/intercom/webhook
  webhook({ notification }) {
    switch (notification.topic) {
      case 'conversation.user.created':
      case 'conversation.user.replied':
        console.log(notification.app_id, notification.data.item);
        return;
      default:
        return;
    }
  },
});
```

The channel publishes `HEAD /webhook` for endpoint validation and
`POST /webhook` for signed notifications. It verifies the exact request body
before parsing, preserves future topics, and does not own installation,
subscriptions, OAuth, deduplication, or outbound Intercom behavior.
