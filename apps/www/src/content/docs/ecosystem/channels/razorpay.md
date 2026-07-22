---
title: Razorpay
description: India-first payments, subscriptions, and billing connector for bapX.
lastReviewedAt: 2026-07-22
---

Razorpay is the planned payments connector for India-first bapX subscriptions and approved payment operations.

bapX billing uses INR. The base subscription is **₹500/month** with **5 GB** included. Additional storage is **₹100/GB/month** up to **100 GB**. The subscription includes hosted agents/workflows, hosted search, browser sessions, Node.js project subdomains, TTS, and STT.

## Planned connector scope

- Create and manage subscription checkout for the selected business account.
- Verify signed Razorpay webhooks before updating subscription state.
- Process webhook event ids idempotently so retries cannot double-apply quota changes.
- Expose read-only payment, subscription, settlement, refund, and reconciliation views to approved agents.
- Require explicit human approval for live captures, refunds, payment links, plan changes, and credential changes.

Razorpay is not a customer-installed CLI workflow. It is a Platform connector and MCP-backed capability that agents may use only inside the selected business/project permission scope.
