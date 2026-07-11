# WhatsApp channel example

This example receives verified WhatsApp Business Cloud webhook deliveries and
uses a project-owned Fetch client for outbound messages.

```sh
npm run check:types
npm run build
npm run test
```

The workerd test executes the real SDK request path against a local fake Fetch
transport. It does not contact Meta.
