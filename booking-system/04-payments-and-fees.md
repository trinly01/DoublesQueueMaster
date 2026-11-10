# 04 — Payments & Zyberlab Fees

## How the Philippines actually books courts (research)

We looked at the local competitors — the pattern is remarkably consistent:

| Product | Payment model |
|---|---|
| **Courtogo** | Free for players. Pay venue **directly** (GCash/bank/cash) → **upload proof in-app** → venue confirms. Optional online pay (QRPh/GCash/Maya/GrabPay) with small service fee. No account needed. |
| **Pickleballer.ph** | Pay venue **direct via GCash**, attach proof screenshot **to that specific booking**. Venue verifies. Emphasizes "pay the actual venue, not the platform." |
| **PickleTime** | Choose GCash/Maya/bank → **QR already contains exact amount** → upload screenshot → claims auto-verification → booking QR for check-in. |
| **CourtSync** | "Pay via GCash and upload proof — simple and transparent." Venue dashboard. |
| **PlayServe** | Full gateway: GCash, Maya, **QRPh**, cards via local gateway. Cash/bank recording with approval flow. SMS+email reminders. ₱999/mo per facility. Transparent convenience fees shown before checkout. |

### The honest read

- **Proof-of-payment upload is the PH norm for independents** — zero
  integration cost, works with any venue's existing GCash, customers
  already know the flow. Cost: manual verification delay (minutes–hours),
  fraud risk (photoshopped receipts), no-shows while "pending."
- **Gateway payments are the premium experience** — instant confirmation,
  no fraud, better show-up rates. Cost: ~2–4% + fixed fees per
  transaction, settlement lag, chargebacks on cards.
- **The winning pattern is hybrid**: proof-upload as the baseline
  (everyone can use it), gateway as the faster option. Courtogo and
  PlayServe both do exactly this.

## Xendit reality check (we "have Xendit integrated")

What we actually have today (`usePayment.ts`): a payment-link endpoint
that returns an `invoice_url` — used for **club activation**. That's a
single Xendit invoice redirect, not a marketplace integration.

### Xendit PH fees (published, excl. VAT)

| Method | Fee | On ₱500 booking | On ₱1,000 |
|---|---|---|---|
| GCash | 3.00% + ₱11 | ~₱26 | ~₱41 |
| Maya / GrabPay | 2.00% + ₱11 | ~₱21 | ~₱31 |
| **QRPh** | 1.50% (min ₱15) + ₱11 | ~₱19–23 | ~₱27 |
| Cards domestic | 3.50% + ₱11 | ~₱28 | ~₱46 |
| Direct debit / VA | 1.00–1.30% + ₱11 | ~₱17–22 | ~₱22–24 |

(PayMongo is a credible alternative: QRPh ~1.34–1.5%, GCash ~2.2–2.5%,
no setup/monthly fee, ₱10 bank payout.)

### ⚠️ Xendit XenPlatform is NOT for us (yet)

Xendit's marketplace product (master account → sub-accounts per tenant
with automated splits/payouts) costs **US$10,000 setup + US$7,500/month +
US$5/active sub-account + KYC fee per sub-account**. That pricing targets
platforms doing serious volume. For MVP we must **not** architect around
it.

## Fee models for Zyberlab — ✅ DECIDED: Model A now, Model B later

**Decision (locked):** launch with **Model A — tenant subscription +
proof-of-payment**. Customers pay venues directly; Zyberlab never
touches booking money at MVP. Model B (platform fee via Xendit) becomes
a per-tenant opt-in in Phase 2 once volume justifies the fee math.
The models below are kept for reference and for the Phase 2 design.

### Model A — Tenant subscription (simplest, recommended for MVP)

- Tenants pay Zyberlab a monthly SaaS fee, **tiered by court count**
  (benchmark: PlayServe ₱999/mo per facility). Suggested tiers:

  | Plan | Price/mo | Courts | Notes |
  |---|---|---|---|
  | `trial` | ₱0 (30 days) | ≤2 | onboarding pilot; converts or suspends |
  | `starter` | ₱499 | ≤2 | single-court venues, food stalls |
  | `growth` | ₱999 | ≤6 | typical multi-court club — PlayServe parity |
  | `business` | ₱1,999 | unlimited | arenas, multi-branch groups |

- Stored per tenant in `book_tenants`: `subscription_plan`,
  `max_courts`, `subscription_status` (`trialing`/`active`/
  `past_due`/`cancelled`), `subscription_renews_at`, `billing_email` —
  all Zyberlab-only fields (tenants see but can't edit; Billing tab).
- **Enforcement (MVP):** manual — admin sees court count vs `max_courts`
  in Studio and follows up / suspends (`status` or `subscription_status`).
  A `court_count` Insights panel or flow-flag can automate the nudge
  later; hard-blocking court creation isn't expressible in validation.
- **Billing mechanics:** reuse the existing Xendit invoice-link pattern
  (same one used for club activation) — monthly/annual invoice to
  `billing_email`. Manual for first tenants; self-serve portal later.
- Customers pay the **venue directly** (GCash proof upload). Zyberlab
  never touches booking money → zero payment ops, zero remittance,
  zero chargeback exposure.
- **Win-win math:** venue gets booking software + customer discovery for
  ~₱33/day; Zyberlab gets predictable MRR; customers pay the venue's
  price with no added fees.
- **Downside:** Zyberlab doesn't participate in booking GMV growth;
  tenants may resist paying before they see results.

### Model B — Platform fee on bookings (revenue-aligned)

- Customer pays through Zyberlab (Xendit invoice). Total = court price
  + platform fee (e.g., ₱20–30 flat or 5–8%).
- Zyberlab keeps the fee, remits court price to tenant (weekly manual
  payout at first).
- **The math is tight on small baskets** — this is the critical insight:

  | Booking | Platform fee @5% | Xendit cost (GCash) | Zyberlab margin |
  |---|---|---|---|
  | ₱400 (1hr) | ₱20 | ~₱23 | **−₱3** ❌ |
  | ₱800 | ₱40 | ~₱35 | +₱5 |
  | ₱1,500 | ₱75 | ~₱56 | +₱19 |

  → A pure percentage can't work on typical ₱300–500/hr courts. You
  need **fee ≥ 6–8%**, a **flat ₱25–40 booking fee**, or a
  **minimum-fee floor** (e.g., "₱30 or 5%, whichever is higher").
  PH customers tolerate a visible convenience fee if it's disclosed
  upfront (PlayServe does this explicitly).

### Model C — Hybrid (this IS the plan, phased)

- **MVP (now):** Model A — subscription or free-pilot tenants;
  proof-of-payment only. Fastest to ship, zero payment risk.
- **Phase 2:** Model B for tenants who opt in — "Get paid instantly"
  toggle per tenant. Zyberlab invoice → settle minus fee.
- **Later:** XenPlatform if volume justifies it (revisit at ~₱1M+/mo
  booking volume — the $7.5k/mo platform fee needs real GMV to make sense).

## Payment flows (UX-level)

### Proof-of-payment flow (Phase 1)

```
Customer picks slot → sees venue GCash name+number+exact amount
→ pays in GCash app → app shows upload form (screenshot + ref no.)
→ booking = pending_payment (slot HELD ~24h or until tenant acts)
→ tenant gets Studio notification → opens proof → approves/rejects
→ approved → booking confirmed → customer gets confirmation + QR
```

- Slot hold duration: configurable per tenant (default: until tenant
  acts, max 24h, then auto-expire via scheduled flow).
- Tenant `auto_confirm_payments` flag: some venues trust customers and
  confirm instantly (status=confirmed on upload, verify later).

### Gateway flow (Phase 2)

```
Customer picks slot → "Pay now" → Xendit invoice (GCash/Maya/QRPh/card)
→ pays on Xendit's hosted page → webhook confirms
→ booking confirmed instantly → QR issued
→ Zyberlab settles to tenant per payout schedule
```

We already have the invoice-link pattern working — extend it to carry
`booking_id` + return URL.

## What to store (already in data model)

`book_payments` per booking: method, amount, platform_fee,
tenant_payout, status, reference (GCash ref / Xendit invoice id),
paid_at. `book_payment_proofs` for uploads. Fee breakdown is
**Zyberlab-admin-only fields** — tenants see gross, not our cut
(field-level permissions hide `platform_fee`/`tenant_payout` from
tenant roles).

## Open fee questions → see `99-open-questions.md`

- ~~Payment model~~ → **DECIDED: Model A** (subscription + proof-of-payment)
- Subscription price point? Free pilot period? (benchmark ₱999/mo)
- **How do tenants pay the subscription?** Manual invoicing vs reuse the
  existing Xendit invoice-link pattern (`payment_settings` flow) — decide
  before onboarding the first tenant.
- Phase 2 prep: platform fee flat vs % vs hybrid? Who absorbs Xendit fees?
