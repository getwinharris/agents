# Twilio channel example

This example receives verified Twilio SMS and MMS webhooks and uses an editable
project-owned Fetch client for outbound messages.

```sh
npm run check:types
npm run build
npm run test
```

The Node and workerd tests execute the same REST request path against local
fake Fetch transports. They do not contact Twilio.
