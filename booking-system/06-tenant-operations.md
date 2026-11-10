# 06 — Tenant Operations (Directus Studio UX)

The tenant never sees custom admin UI — **Studio IS the product** for
them. Every collection, form, dashboard, and flow below is configured
in Directus so a non-technical venue owner can run their business.

## Tenant mental model → Studio mapping

| What the tenant thinks | What they actually do in Studio |
|---|---|
| "My courts" | `book_courts` list — add/edit/archive courts, set prices |
| "My schedule" | `book_opening_hours` — weekly hours; `book_closures` — exceptions |
| "Today's bookings" | `book_bookings` filtered view + Insights dashboard |
| "Did they pay?" | `book_payment_proofs` — approve/reject with one dropdown |
| "Block tomorrow 2–4 PM" | `book_closures` new row (or calendar layout later) |
| "How's business?" | Insights dashboard — bookings, revenue, occupancy |

## Collection-by-collection Studio setup

### `book_courts` — the most-used collection

- **Display template:** `{{name}} — {{sport.name}} ({{surface}})`
- **List view columns:** name, sport icon, price/hr, status chip
- **Form (field-detail-simple):** name, sport dropdown, surface select,
  price_per_hour (prefix ₱), status, photos, sort — in that order.
  Hide tenant field (auto-filled by preset/permission).
- **Notes on fields:** price → "Per hour, before any platform fees";
  status → "Maintenance hides it from booking but keeps history."
- **Archive pattern:** status=`inactive` (never delete — bookings
  reference courts).

### `book_bookings` — daily driver

- **Display template:** `{{ref}} · {{customer_name}} · {{tenant.name}}`
  (slots shown via related `book_booking_slots` panel on the detail
  page — O2M layout shows court + date + time + price per row)
- **Preset on create (tenant-made walk-ins):** `source=walk_in`,
  `status=confirmed`, `payment_status=paid` — one-click correct
  defaults.
- **Filters saved as "views":**
  - "Today" — `slots.date = today` (or a date filter on header)
  - "Needs verification" — `payment_status=pending_verification`
  - "This week" — date range
  - "Cancelled/No-show" — terminal states for review
- **Field conditions:** `internal_notes`, `platform_fee`,
  `tenant_payout` → **hidden from tenant role** (Zyberlab-only).
- **Detail layout:** header info top, slots table middle, payments +
  proofs accordion bottom, activity log right.

### `book_payment_proofs` — the verification queue

This is THE daily task for proof-flow tenants. Optimize it:

- **Display template:** `{{booking.ref}} · {{sender_name}} · ₱{{payment.amount}}`
- **List columns:** booking ref, sender name, amount, sent_at, status
- **Form:** file preview large (image interface), sender_name,
  reference_no, sent_at, status dropdown
  (`pending → approved / rejected`), rejection_reason (shown only when
  rejected — field conditions), reviewed_by auto (=current user)
- **One-click approve flow (phase 2):** custom interface button or a
  Flow that approves + stamps reviewed_at/by — reduce to 2 clicks.
- Sort default: oldest pending first (FIFO fairness).

### `book_opening_hours` / `book_closures`

- Opening hours: matrix-ish form — day_of_week select, open/close time
  pickers, closed checkbox. 7 rows per tenant, editable inline.
- Closures: date range picker + reason + optional court. Display
  template: `{{reason}} · {{date_start}}→{{date_end}}`.

### `book_tenants` (self-view)

- Tenant sees own record read-mostly: name, address, GCash details
  (editable — this is where they update payout info), hours defaults,
  policies (cancel cutoff, slot minutes). Zyberlab admin owns status.

## Insights dashboards (tenant-facing)

Build one **"Venue Overview" dashboard** per tenant scope — Directus
Insights panels filter by permissions automatically (tenant role only
sees own rows → panels Just Work).

| Panel | Type | Metric |
|---|---|---|
| Bookings today | metric | count `book_bookings` where date=today |
| Revenue today | metric | sum `book_payments.amount` paid today |
| Revenue this week | metric | sum, date range |
| Bookings by status | bar-chart | pending/confirmed/completed/cancelled |
| Bookings by court | bar-chart | which courts earn most |
| Peak hours | bar-chart (flow-powered if needed) | bookings by start_time |
| Pending verifications | metric | `payment_status=pending_verification` — **the action queue** |
| Occupancy rate | metric/variable | booked slot-minutes ÷ open slot-minutes (needs flow or computed field) |
| Upcoming bookings | table/tabular layout | next 20 confirmed |

Native panels cover most; occupancy % and peak-hour heatmaps likely
need an `echarts-panel`-style flow endpoint (we have the pattern from
Mitmit's insights skill).

## Flows tenants benefit from (configured by Zyberlab, invisible to tenant)

> **Full executable spec: `08-studio-layout-and-flows.md` Part 3** —
> 14 flows with triggers, conditions, and likha_sql bodies. Summary:

| Flow | Trigger | Does |
|---|---|---|
| `booking_ref` | create `book_bookings` | assigns `BK-YYYY-NNNN` |
| `proof_approved` | update `book_payment_proofs.status→approved` | sets payment paid + booking payment_status=paid (+ confirmed if auto) |
| `booking_confirmed_notify` | booking → confirmed | email/push to customer |
| `proof_pending_notify` | proof created | notifies tenant (mail to contact_email or Studio notification) |
| `slot_expire_sweeper` | schedule every 5 min | releases `held` slots past TTL, expires bookings |
| `reminder_24h` | schedule hourly | finds bookings tomorrow → reminder notification |
| `reminder_1h` | schedule every 15 min | same-day soon bookings |
| `booking_cancelled_notify` | status → cancelled | customer notification + reason |
| `no_show_sweeper` | schedule daily | marks past confirmed bookings no_show after grace |

**Traps to respect** (from Mitmit's verified flow notes): event-flow
`options.scope`=event names vs `collections`=collection names; ops
writing cross-collection need `permissions:"$full"` or run under
triggering user's role (tenant-triggered flows run as tenant —
customer-facing writes should use `likha_sql` which bypasses ACL);
`emitEvents:false` on write-backs to avoid loops; cron flows need
schedule triggers.

## Tenant onboarding runbook (Zyberlab admin does this)

1. Create `book_tenants` record (name, slug, GCash details, hours).
2. Create their courts (`book_courts` rows).
3. Create Studio user(s) → assign tenant role/policy + set
   `book_tenant` link (Option A) or tenant role (Option B).
4. Tenant logs into Studio → sees BOOKING nav → dashboard live.
5. First booking test: Zyberlab admin makes a test booking → tenant
   verifies proof → confirms loop works end-to-end.

Target: under 30 min, mostly data entry.

## What tenants should NEVER do (guardrails)

- Delete bookings/slots/payments — archive/cancel statuses instead
  (permissions: no `delete` on these collections for tenant role)
- Edit prices on historical slots (price is snapshot; edit court rate
  affects future only)
- See platform_fee / Zyberlab cut (field-level hide)
- Create bookings for other tenants (item permission filters)
