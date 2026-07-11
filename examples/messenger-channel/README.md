# Facebook Messenger channel example

This example receives verified Facebook Messenger Page webhooks and uses an
editable project-owned Graph API Fetch client for outbound messages.

```sh
npm run check:types
npm run build
npm run test
```

The Node and workerd tests execute the same Graph request path against local
fake Fetch transports. They do not contact Meta.
