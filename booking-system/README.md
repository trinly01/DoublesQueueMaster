# Zyberlab Booking System — Planning Docs

Planning-only documentation for a **sports-facility court booking** product
built on the existing stack: **Directus** backend (`api.dinkmatch.club`) +
**Quasar/Vue 3 PWA** frontend. No code changes yet — these docs capture the
product model, data design, payments research, UX flows, and open decisions.

## The one-paragraph version

Venues (tenants) list their courts and manage everything inside **Directus
Data Studio** — no custom admin UI to build or maintain. Customers book
courts through a **new route in our existing PWA**. **Zyberlab earns a
tenant subscription** (Model A — customers pay venues directly via
GCash proof-of-payment; we never touch booking money at MVP). Xendit
invoice checkout per booking is the Phase 2 opt-in path.

## Actors

| Actor | Surface | What they do |
|---|---|---|
| **Customer** | Quasar PWA (`/book/*` routes) | Browse venues → pick court + time → pay → get booking QR → check in |
| **Tenant** (venue owner/manager/staff) | Directus Data Studio | Manage courts, hours, bookings, verify payment proofs, view dashboards |
| **Zyberlab admin** | Directus Data Studio (full access) | Onboard tenants, monitor platform, adjust fees/settings |

## Doc map

| File | Contents |
|---|---|
| `01-vision-and-scope.md` | Product concept, phased scope, what we are NOT building yet |
| `02-architecture-and-tenancy.md` | Directus + Quasar split, multi-tenant model, roles & policies |
| `03-data-model.md` | `book_*` collections, fields, relationships, statuses |
| `04-payments-and-fees.md` | PH payment research, Xendit reality check, Zyberlab fee models |
| `05-customer-ux.md` | Booking flow step-by-step, court/time-slot UX, collision handling |
| `06-tenant-operations.md` | Studio setup for tenants: forms, insights, flows, daily workflow |
| `07-naming-and-conventions.md` | Collection names, booking refs, statuses, URL routes |
| `08-studio-layout-and-flows.md` | **Executable spec**: per-collection tab/group/width form layouts, list views, display templates, 14 flow automations |
| `99-open-questions.md` | Decisions needed before build |

## Key decisions already made (from discussion)

- Collections prefixed **`book_`**
- Tenants operate inside **Directus Studio** directly (like Mitmit merchants)
- Customers use **our Quasar frontend** on a **separate route**
- Multi-tenant: **one tenant = one venue/business with multiple courts**
- Payments research: PH norm is **GCash proof-of-payment upload**; gateway
  (Xendit/PayMongo) is the premium path — details in `04`
- Collision handling must be **server-enforced**, not just UI-hidden
- **Business model: Model A** — tenant subscription; customers pay venues
  directly. No booking-money touch at MVP; Xendit platform fee is a
  Phase 2 per-tenant opt-in.
