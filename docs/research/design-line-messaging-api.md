# Design Research: LINE Messaging API Consumer Webhook Constraints

**Date:** 2026-07-03  
**Topic:** LINE Messaging API webhook delivery, reply, content retrieval, and message limits.

## Findings

### 1. Webhook Response Timeout (CRITICAL FOR V1 DESIGN)

**Fact:** LINE Platform waits **2 seconds** for the webhook endpoint to return HTTP 200.

If the bot server does not respond within this 2-second window:
- The response is not received by the LINE Platform, or sending fails midway
- The webhook delivery is marked as `request_timeout`
- LINE does **not** retry automatically (confirmation: webhook redelivery is **opt-in**; see LINE channel settings)

**Implication for V1:** The brief assumes synchronous processing (OCR call inside doPost). At p95 2–3s for OCR (up to ~10s) and overhead from LINE getContent, **this violates the 2-second constraint**. 
- **Decision:** Webhook must return HTTP 200 immediately, then queue work asynchronously (e.g., via Apps Script bound to a trigger, or via a separate function invocation). Actual reply can happen later via Push API.

**Source:** [Check webhook error causes and statistics | LINE Developers](https://developers.line.biz/en/docs/messaging-api/check-webhook-error-statistics/)

---

### 2. Reply Token

**Validity Period:** Official LINE documentation does not specify a numeric TTL in the search results. Community reports and older issues (2017) suggest it may be ~10 seconds, but this is **unconfirmed**. 
- **Risk Flag:** The brief assumes "send reply via reply token ASAP" — this is safe practice, but the exact expiry window is **unknown and not documented publicly**. 

**Single-Use Limit:** Confirmed — reply token can be used **exactly once**.

**Max Replies Per Token:** Official documentation does not specify. Industry practice (typical for chat APIs) is 1 reply message per token, but this is **not confirmed from LINE docs**.

**Recommendation:** Use reply token immediately if available; treat as best-effort. For guaranteed delivery after token expires, use Push API.

**Source:** [Send messages | LINE Developers](https://developers.line.biz/en/docs/messaging-api/sending-messages/)

---

### 3. Message Content (getContent)

**Endpoint:** `GET https://api-data.line.me/v2/bot/message/{messageId}/content`

**Size Limit:** Maximum 2 MB per request. Requests exceeding this return `413 Payload Too Large`.

**Availability/Expiry Window:** Official documentation does not specify how long image content remains available for download after the webhook event. **This is unknown and not documented**. 
- Industry typical: 24–48 hours, but not confirmed for LINE.
- **Risk:** If a job queue fails and retries later, content may have expired.

**Rate Limit:** General webhook rate limit is ~1,000 requests/minute. Specific rate limit for getContent itself is not detailed in official docs. As of April 2025, rate limits are **per-second** based on endpoint; exceeding returns `429 Too Many Requests`.

**Recommendation:** Download content immediately upon webhook receipt, or assume it may not be available later.

**Source:** [Messaging API reference | LINE Developers](https://developers.line.biz/en/reference/messaging-api/)

---

### 4. Flex Message Limits

**Bubble Limits:**
- Max 10 bubbles per carousel
- Max 10 KB JSON per bubble
- Max 50 KB JSON per carousel

**Implication:** The v1 Flex reply (showing workout metrics) must fit within these. A single bubble with 5–10 metric fields should easily fit under 10 KB.

**Source:** [Flex Message elements | LINE Developers](https://developers.line.biz/en/docs/messaging-api/flex-message-elements/)

---

### 5. Push API Free-Tier Quota

**Monthly Free Quotas** (by Communication Plan):
- **Communication Plan:** 200 free messages/month
- **Light Plan:** 5,000 free messages/month
- **Standard Plan:** 30,000 free messages/month

**Counting:** Messages are counted by the number of recipients, not by the number of message objects. If you send 1 message with 4 objects to a chat with 5 users, that counts as 5 messages sent.

**Non-Delivered Messages:** If a user has blocked the account or the user ID doesn't exist, the message is **not** counted.

**Implication for V1:** The brief mentions Push API as a fallback. If using the default Communication Plan (200/month), a production bot with even 10 active users sending daily replies would exhaust quota in ~20 days. Plan accordingly or use Pull (reply token) as primary.

**Source:** [Messaging API pricing | LINE Developers](https://developers.line.biz/en/docs/messaging-api/pricing/)

---

## Summary of Unknowns & Risks

| Unknown | Impact | Mitigation |
|---------|--------|-----------|
| Webhook redelivery behavior | If bot timeout, unknown if LINE retries | Assume no retry; log failure; manual recovery via job queue |
| Reply token exact TTL | If token expires before use, reply fails | Always use token immediately; treat as best-effort; use Push API for guaranteed delivery |
| getContent availability window | Content may expire; late retries fail | Download immediately; do not queue for later retrieval |
| getContent specific rate limit | Rate limiting may be stricter than general 1k/min | Safe default: 1 getContent per message, no bursting |
| Push API quota for active bots | Low quota may hit ceiling quickly | Switch to Pull (reply token) for primary flow; use Push only for notifications |

---

## Recommendations for V1

1. **Async Processing:** Return HTTP 200 to LINE immediately. Queue OCR + sheet write as a separate async job (not within doPost).
2. **Reply Method:** Prefer reply token (immediate, free). Fall back to Push API only if token expires.
3. **Content Download:** Fetch image via getContent synchronously during webhook processing, before returning 200. Do not defer.
4. **Error Handling:** Log failed webhooks and implement a recovery mechanism (e.g., manual re-trigger via a scheduled function).
5. **Flex Limits:** Confirmed safe for v1 metrics display; no architectural changes needed.
