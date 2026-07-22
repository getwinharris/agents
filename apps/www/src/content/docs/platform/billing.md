---
title: Platform billing
description: India-first bapX subscription and storage limits.
---

`platform.bapx.in` owns subscription settings and storage limits for bapX accounts.

The India-first plan is **₹500/month** and includes **5 GB** of workspace storage, hosted agents and workflows, hosted search, browser sessions, Node.js project subdomains, TTS, and STT. Additional storage is **₹100 per GB per month** up to **100 GB**.

Customers bring their own AI-provider and connector credentials. The subscription covers bapX hosting and workspace storage; provider usage and third-party connector charges remain owned by the customer.

Razorpay is the planned payment owner for INR subscriptions. A production subscription must verify signed webhooks, process events idempotently, and enforce quota changes on the server before storage or hosted-work limits change.
