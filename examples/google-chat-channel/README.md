# Google Chat channel example

This example shows a verified Google Chat interaction route, a project-owned
Fetch client that authenticates with a service account, and an application-owned
message tool. Direct callbacks use Google Chat's native uppercase interaction
discriminants and derive canonical space and thread references from the native
payload without allowing a thread from another space.

Required environment variables:

```sh
GOOGLE_CHAT_APP_URL=https://example.com/channels/google-chat/interactions
GOOGLE_CHAT_CLIENT_EMAIL=chat-app@example-project.iam.gserviceaccount.com
GOOGLE_CHAT_PRIVATE_KEY='-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n'
```

The direct interaction route is:

```txt
POST /channels/google-chat/interactions
```

Google Chat requires a direct HTTP response within 30 seconds. The package does
not impose a timeout that returns while non-cancelled application work continues;
keep the callback short and admit durable work promptly.

The optional Google Workspace Events route accepts only the wrapped,
authenticated Pub/Sub push body:

```txt
POST /channels/google-chat/events
```

The Pub/Sub push subscription's acknowledgement deadline is configurable; set
it for the application's admission work. Pub/Sub retries unacknowledged or failed pushes,
so claim `delivery.message.messageId` in durable storage before dispatch and use
`delivery.deliveryAttempt` only as retry metadata. The package verifies and
forwards the wrapper but does not deduplicate deliveries.

`npm test` executes the real project-owned client in both Node and workerd
against an injected fake Fetch transport; it never contacts Google.
