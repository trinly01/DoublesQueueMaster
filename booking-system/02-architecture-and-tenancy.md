# 02 — Architecture & Multi-Tenancy

## The split

```
┌─────────────────────┐         ┌──────────────────────────┐
│  Quasar PWA (us)    │         │  Directus Data Studio    │
│  /book/* routes     │         │  (tenants + zyberlab)    │
│  customers only     │         │  no custom admin UI      │
└─────────┬───────────┘         └───────────┬──────────────┘
          │   REST/Realtime/Files           │
          └──────────────► api.dinkmatch.club ◄─────────────┘
                     book_* collections
                     policies (RBAC)
                     flows (automation)
                     insights (dashboards)
```

**Rule:** anything a tenant does daily must be possible in Studio with
zero custom code — that's the whole point of giving them Studio access.
Anything a *customer* does must be possible in our PWA.

## Multi-tenant model

**One tenant = one venue business** (e.g., "Siklab Pickleball Club",
"Dinkilicious") with **N courts** underneath.

```
book_tenants (venue)
   ├── book_courts (Court 1, Court 2, ...)
   ├── book_opening_hours (weekly schedule)
   ├── book_closures (date exceptions)
   └── book_tenant_users (staff accounts → directus_users)
```

A tenant can later expand to multiple branches by adding a `branch`
field or child tenants — design the schema so `book_courts.tenant`
always points at the *operating* entity.

## How tenant isolation works in Directus

Directus permissions are **collection × action × item-filter** based.
Two viable patterns:

### Option A — Shared role + item filters ✅ VERIFIED & CHOSEN

**Status: implemented and tested on api.dinkmatch.club (Nov 2026).**

One `book_tenant` role + one `book_tenant` policy. Isolation is enforced
by permission item-filters, all verified live:

- **Read:** deep relational filters, e.g. on `book_courts`:
  `{tenant: {tenant_users: {user: {_eq: "$CURRENT_USER.id"}}}}` —
  multi-tenant aware (staff of 2 venues sees both).
- **Create/Update:** item filters do NOT constrain writes (verified —
  a cross-tenant court WAS created before the fix). Guarded instead by
  `validation: {tenant: {_eq: "$CURRENT_USER.book_tenant"}}`.
- **Multi-venue staff (verified Nov 2026):** `directus_users.book_tenant`
  is the staff member's **active venue** — the venue new records are
  stamped into. Junction rows in `book_tenant_users` define ALL venues
  they may access. Staff switch venues by editing their own profile
  (`book_tenant` dropdown, self-update perm limited to that field,
  validated by `{_in: "$CURRENT_USER.book_tenant_ids"}` — a json array
  kept in sync from junctions by the `tenant_user_sync` flow; deep
  membership filters fail closed in validation, `_in` on a json array
  works). Reads/updates/deletes already span all member venues via the
  deep item filters; creates always land in the active venue.
- **Auto-stamp:** permission `presets` fill `tenant` and walk-in
  defaults (`source=walk_in, status=confirmed, payment_status=paid`)
  server-side — verified working.
- **Create validation reality (verified Nov 2026):** relational
  (deep) filters inside `validation` FAIL CLOSED on create —
  `booking.tenant._in …` rejects every payload with
  "Value is required" even when `booking` is present. Only flat-field
  rules work on create (`tenant _eq $CURRENT_USER.book_tenant`,
  `status _eq …`). Child-record ownership (`book_booking_slots`,
  `book_payments`, `book_payment_proofs` attached to a foreign
  booking) is therefore enforced by the **`child_record_guard` flow**:
  on every create it deletes the row unless the creator is the
  booking's customer, staff of the booking's venue
  (`book_tenant_users`), or admin — using `$accountability`.
- **Field-level:** `platform_fee`, `tenant_payout`, `status`,
  `settings`, `subtotal/total` excluded from tenant-writable fields.
- **Supporting reads:** `directus_users` read limited to
  `[id, first_name, last_name, avatar, book_tenant, book_tenant_ids]`;
  `directus_files` read for images; `book_sport_types` read-all.

Scripts: `scripts/setup-booking-schema.mjs`,
`scripts/setup-booking-permissions.mjs`,
`scripts/setup-booking-customer-perms.mjs`,
`scripts/setup-booking-multivenue.mjs`,
`scripts/setup-booking-flows.mjs`,
`scripts/migrate-book-uuids.mjs`,
`scripts/add-booking-system-fields.mjs`,
`scripts/fix-book-field-sorts.mjs`,
`scripts/fix-book-group-fields.mjs` (all idempotent).

### Option B — Role per tenant (rejected for now)

- `book_tenant_siklab`, `book_tenant_dinkilicious`, ...
- Permissions hard-filter by role → zero dynamic-variable dependency.
- **Pros:** bulletproof isolation, simplest mental model.
- **Cons:** role explosion (every new tenant = new role + permission
  set to configure); onboarding is manual per tenant.
- Kept as fallback if Option A ever shows cracks at scale.

### Zyberlab admin

- Full `admin_access` policy (or existing admin role) — sees everything,
  creates tenants/users, adjusts platform settings.

### Customers

- Existing app users (`directus_users`) — customer role can:
  - `read` on `book_tenants`, `book_courts`, `book_opening_hours`,
    `book_closures` (public venue browsing)
  - `read` own `book_bookings`/`book_payments` (`customer._eq.$CURRENT_USER`)
  - `create` on `book_bookings` + `book_booking_slots` +
    `book_payment_proofs` (with **validation rules** — e.g., can't set
    `status=confirmed` themselves; flows/admin move it forward)
- **Guests** (no account): Phase 2 — requires either anonymous create
  permission ( risky ) or a lightweight guest-checkout flow. MVP:
  account required (our app already has auth).

## What tenants see in Studio (navigation)

Collections are prefixed `book_` so they group together. Inside Studio,
we'll configure:

- **Navigation bookmark/folder**: `BOOKING` section
- **Display templates** so lists read like sentences, e.g. bookings
  show `BK-2026-0042 · Maria Santos · Court 1 · Sat 9:00–10:00`
- **Field conditions**: hide internal fields (fees, platform cut) from
  tenant roles
- **Notes/help text** on fields ("Price is per hour before fees")

## Realtime & offline

- Studio has websocket realtime — tenant sees new bookings/proofs land
  live. Free.
- Customer PWA: booking availability should revalidate on screen focus;
  holds prevent stale-slot races (see `05`).

## Where custom code is still needed

| Need | Solution |
|---|---|
| Atomic slot conflict check | `likha_sql` flow op or custom endpoint (see `05`) |
| Payment proof → file storage | `directus_files` (built-in) + `book_payment_proofs` |
| Xendit invoice creation | existing payment-link endpoint pattern |
| Customer-facing venue/slot browsing UI | our Quasar app (Directus API) |
| Booking QR check-in | generated in app (signed token or booking ref + PIN) |

Everything else — CRUD, dashboards, notifications, reminders — is
native Directus.
