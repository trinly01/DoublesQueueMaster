# 01 — Vision & Scope

## What we're building

A **multi-tenant sports-facility booking platform** for the Philippines:

- **Venues** (pickleball courts, basketball courts, badmiton halls, etc.)
  sign up as tenants and manage their inventory themselves.
- **Customers** discover venues in the app, pick a court and a time slot,
  pay, and show a booking QR at the venue.
- **Zyberlab** provides the platform and earns a **tenant subscription**
  (Model A) — tenants get booking software + customer reach, customers
  get instant booking without chat-and-screenshot chaos, and Zyberlab
  never touches booking money at MVP. A per-booking platform fee via
  Xendit is the Phase 2 opt-in.

## Why this fits what we already have

- **Directus backend exists** (`api.dinkmatch.club`) — collections, auth,
  files (for payment proofs), Flows, Insights all available today.
- **Quasar PWA exists** — we add a `/book` section alongside the queue app.
- **Xendit invoice flow exists** (`usePayment.ts` → `invoice_url`) — proof
  that payment-link checkout already works in our stack.
- **Mitmit precedent** — our sibling project already runs the exact same
  pattern: merchants operate inside Directus Studio with owner-scoped
  permissions while customers use a custom frontend. We are not inventing
  the tenant model; we're copying a proven one.

## Actors & surfaces

```
Customer ──► Quasar PWA (/book/*)          Tenant ──► Directus Studio
                │                                │
                └────────► Directus API ◄─────────┘
                     (book_* collections, policies,
                      flows, insights)
```

- **Customer** never sees Directus. Everything through our app.
- **Tenant** never sees our app's admin UI. Everything through Studio —
  which is why collection/field/form design IS the tenant UX (see `06`).
- **Zyberlab admin** uses Studio with full permissions.

## Phased scope

### Phase 1 — MVP (prove the loop)

- Single-sport focus first? **No — model supports any sport**, but launch
  marketing can lead with pickleball (our existing community).
- Tenants: manual onboarding by Zyberlab admin (we create their Studio
  user + tenant record). No self-serve signup yet.
- Courts with hourly pricing, weekly opening hours, closures.
- Customer booking: venue → court → date → time slot → details →
  **proof-of-payment upload** → tenant verifies → confirmed + booking QR.
- Tenant ops in Studio: view bookings, verify proofs, block slots.
- Basic insights: today's bookings, revenue, pending verifications.

### Phase 2 — payments & polish

- Xendit invoice checkout per booking (GCash/Maya/QRPh/cards) — money to
  Zyberlab, remitted to tenant minus platform fee.
- Automated reminders (day-before, 1-hour-before) via Flows.
- Cancellation/reschedule policies per tenant.
- Tenant self-serve onboarding (public signup → pending approval).
- Walk-in / manual booking entry by tenant staff.

### Phase 3 — growth

- Memberships/packages (e.g., "10-hour card"), promos/vouchers.
- Multi-court group bookings, tournaments/league tie-ins with DinkMatch.
- Payout automation (Xendit XenPlatform or manual weekly remittance).
- Reviews/ratings, venue discovery map.

## Explicitly NOT in scope (yet)

- Equipment rental, coaching bookings, event ticketing
- Customer accounts beyond what auth already gives (guest checkout allowed)
- Native iOS/Android apps (PWA covers it)
- Tenant-branded white-label apps
- Automated KYC/payout onboarding for tenants (manual at launch)

## Success criteria for MVP

- A tenant can go from "account created" to "first confirmed booking"
  in under 30 minutes using only Studio.
- A customer can complete a booking on mobile data in under 2 minutes.
- Zero double-bookings — enforced server-side, not by UI luck.
- Tenant sees pending payments in one dashboard panel, not by scrolling
  a raw table.
