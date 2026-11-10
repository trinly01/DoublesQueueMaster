# 03 — Data Model (`book_*` collections)

Naming: `book_` prefix + singular snake_case entity. Junctions:
`book_{a}_{b}`. All money in **PHP numeric** (or integer centavos —
decide once; numeric(10,2) is simpler for Directus forms).

## Entity map

```
book_tenants ──< book_courts ──< book_booking_slots >── book_bookings ──< book_booking_slots
     │              │                                        │
     │              └──< book_opening_hours (tenant-level)   ├──< book_payments
     ├──< book_closures                                     └──< book_payment_proofs
     └──< book_tenant_users ──> directus_users
book_sport_types (catalog: pickleball, basketball, ...)
```

## Collections

### `book_tenants` — the venue

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| name | string | "Siklab Pickleball Club" |
| slug | string | URL-safe, unique — `/book/s/siklab` |
| logo | file | directus_files |
| description | text | |
| address | string | |
| latitude / longitude | decimal | for "near me" |
| contact_phone / contact_email | string | |
| gcash_number / gcash_name | string | **what customers pay for proof flow** |
| bank_details | text/JSON | fallback instructions |
| timezone | string | default `Asia/Manila` |
| currency | string | `PHP` |
| slot_minutes | integer | booking grid step: 30 or 60 (default 60) |
| min_duration / max_duration | integer | minutes |
| buffer_minutes | integer | turnover gap between bookings (default 10) |
| cancel_cutoff_hours | integer | free-cancel window (default 24) |
| auto_confirm_payments | boolean | proof flow: false = tenant must verify |
| status | string | `pending` / `active` / `suspended` — Zyberlab controls |
| subscription_plan | string | `trial` / `starter` / `growth` / `business` — Zyberlab only |
| max_courts | integer | plan court limit (blank = unlimited) — Zyberlab only |
| subscription_status | string | `trialing` / `active` / `past_due` / `cancelled` — Zyberlab only |
| subscription_renews_at | timestamp | next billing date — Zyberlab only |
| billing_email | string | invoice email — may differ from venue contact |
| settings | JSON | future knobs without migrations |

### `book_sport_types` — catalog (tiny)

`id, name, icon, sort` — pickleball, basketball, badminton, tennis,
volleyball, futsal, table tennis, other. Court points at one sport;
a court could be multi-sport via `sports` M2M later — start single.

### `book_courts` — bookable units

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| tenant | M2O → book_tenants | required |
| name | string | "Court 1", "Arena A", "Table 3" |
| sport | M2O → book_sport_types | |
| surface | string | `indoor`/`outdoor`/`hard`/`grass`/`synthetic` |
| description | text | |
| photos | files (M2M) | |
| price_per_hour | decimal | base rate |
| peak_multiplier | decimal | e.g. 1.5 for peak hours — or use time-based pricing table later |
| status | string | `active` / `maintenance` / `inactive` |
| sort | integer | display order |

**Time-based pricing (phase 2):** `book_court_rates` child table —
(day_of_week, start_time, end_time, price). Keep `price_per_hour` as
the flat fallback so MVP needs no extra table.

### `book_opening_hours` — weekly schedule (tenant-level default)

`id, tenant M2O, day_of_week (0-6), open_time, close_time, closed bool`
— one row per day per tenant. Courts inherit tenant hours in MVP;
per-court overrides later via nullable `court` M2O on this table.

### `book_closures` — exceptions

`id, tenant M2O, court M2O (nullable = whole venue), date or
date_start/date_end, reason, all_day bool, start_time/end_time nullable`
— maintenance, private events, holidays.

### `book_bookings` — the reservation header

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| ref | string | human ref `BK-2026-0042` (flow-generated) |
| tenant | M2O → book_tenants | denormalized for filtering speed |
| customer | M2O → directus_users | null for guest (phase 2) |
| customer_name / customer_phone / customer_email | string | snapshot — survives account deletion |
| status | string | see status table below |
| payment_status | string | `unpaid`/`pending_verification`/`paid`/`refunded`/`failed` |
| subtotal / platform_fee / total | decimal | fee breakdown visible to Zyberlab only |
| notes | text | customer notes |
| internal_notes | text | tenant-only (field-hidden from customer role) |
| source | string | `app` / `walk_in` / `phone` / `admin` |
| checked_in_at | timestamp | QR scan time |
| cancelled_at / cancel_reason | | |
| created_at / updated_at | | audit |

### `book_booking_slots` — what exactly is booked

One booking → one or more slot rows (**this is how "multiple courts
same time" works**: a group booking = N slot rows under one header).

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| booking | M2O → book_bookings | required |
| court | M2O → book_courts | required |
| date | date | local venue date |
| start_time / end_time | time | local venue time — **or** `starts_at/ends_at` timestamptz |
| duration_minutes | integer | derived, stored for queries |
| price | decimal | locked at booking time (rate changes don't retro-price) |
| status | string | `held` / `confirmed` / `released` / `cancelled` |
| held_until | timestamp | hold expiry — set by flow at creation (~30 min), drives the sweeper |
| tenant | integer → book_tenants | **denormalized** — stamped by preset/flow; enables direct tenant filters |

> **Time representation decision:** store `date` + `time` in venue-local
> terms (simpler Studio UX, matches how tenants think) AND derive
> `starts_at` timestamptz for overlap queries. All venues are PH
> (UTC+8, no DST) so local math is safe.

### `book_payments` — money records

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| booking | M2O → book_bookings | |
| tenant | integer → book_tenants | denormalized — same stamp pattern as slots |
| method | string | `gcash`/`maya`/`qrph`/`card`/`bank`/`cash`/`xendit_invoice` |
| amount | decimal | what customer paid |
| platform_fee | decimal | Zyberlab cut (phase 2) |
| tenant_payout | decimal | what venue receives |
| status | string | `pending`/`paid`/`failed`/`refunded`/`expired` |
| reference | string | GCash ref no., Xendit invoice id |
| xendit_invoice_id / xendit_invoice_url | string | phase 2 |
| paid_at | timestamp | |
| receipt_file | file | optional receipt image |

### `book_payment_proofs` — proof-of-payment uploads (Phase 1 core)

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| booking | M2O → book_bookings | |
| payment | M2O → book_payments | nullable |
| tenant | integer → book_tenants | denormalized — same stamp pattern |
| file | file | directus_files — the screenshot |
| sender_name / reference_no / sent_at | string | what customer typed |
| status | string | `pending`/`approved`/`rejected` |
| reviewed_by | M2O → directus_users | tenant staff who verified |
| reviewed_at | timestamp | |
| rejection_reason | text | shown to customer |

On `approved` → flow sets `book_payments.status=paid` +
`book_bookings.payment_status=paid` (+ optionally `status=confirmed`).

### `book_tenant_users` — staff junction (multi-user venues)

`id, tenant M2O, user M2O → directus_users, role string
(owner/manager/front_desk)` — needed when a venue has several staff
accounts. Owner creates via Zyberlab admin or tenant owner invites.

**`directus_users.book_tenant`** (integer → book_tenants): the staff
member's **active venue** — permission presets stamp
`tenant: "$CURRENT_USER.book_tenant"` on creates and write-validation
requires it. Staff switch it via their own profile (self-update perm,
membership-validated). Multi-venue staff keep ALL memberships in
`book_tenant_users`; reads/updates span every member venue.

**`directus_users.book_tenant_ids`** (json, hidden): mirror of the user's
junction venue IDs, maintained by the `tenant_user_sync` flow on every
`book_tenant_users` write. Drives the self-update validation
`{book_tenant: {_in: "$CURRENT_USER.book_tenant_ids"}}` — the only
membership check Directus validation can express (deep filters fail
closed; `_in` on a json array works — verified).

## Status model

### `book_bookings.status`

```
pending_payment → confirmed → checked_in → completed
       │              │
       ├─ expired    ├─ cancelled (by customer, cutoff rules)
       └─ rejected   └─ no_show
```

- `pending_payment`: slot(s) **held** — counts as occupied for conflicts
- `confirmed`: slot(s) confirmed — tenant verified proof or gateway paid
- `checked_in`: customer scanned QR at venue
- `completed`: day passed / tenant closed it out
- `no_show`: tenant marks after grace period
- `cancelled`/`rejected`/`expired`: terminal, frees slots

### `book_booking_slots.status`

`held` → `confirmed` (payment verified) | `released` (expired/cancelled)
— kept separate so a booking can be confirmed while payment pends,
depending on tenant `auto_confirm_payments`.

## Integrity rules (enforced where possible)

1. **No overlapping confirmed/held slots on same court+date+time** —
   server-side (see `05` collision section; Postgres exclusion constraint
   or likha_sql guard — NOT just UI).
2. `total = subtotal + platform_fee` — computed server-side/flow, never
   trusted from client.
3. Customers can only create `status=pending_payment` bookings —
   permission `validation` rules + flows move it forward.
4. Only tenant roles can approve/reject proofs and mark
   checked_in/no_show/completed.
5. Price snapshot on slot at creation — later rate edits don't rewrite
   history.
