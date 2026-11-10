# 05 — Customer UX (Quasar app, `/book/*` routes)

Design goals: **≤5 taps to a held slot**, readable on cheap Android
phones + weak signal, no account required where possible, every state
legible (held/paid/confirmed/checked-in).

## Route map

```
/book                    → venue discovery (search + "near me")
/book/v/:slug            → venue page (info, courts, hours, photos)
/book/v/:slug/book       → date → court/time grid → slot select
/book/checkout           → details + payment method
/book/confirmation/:ref  → success state + booking QR + instructions
/book/my                 → my bookings (upcoming/past/cancelled)
/book/my/:ref            → booking detail (QR, cancel/reschedule)
```

## Step-by-step flow

### 1. Discover (`/book`)

- Search bar + sport filter chips (Pickleball / Basketball / ...)
- Venue cards: photo, name, distance, rating (phase 2), "from ₱X/hr",
  next-available hint ("Available today 2–9 PM")
- Sort: nearest / name / price
- **Offline:** venue list cacheable (venues change rarely) — last-known
  list shows with a subtle "offline — prices may be stale" note.

### 2. Venue page (`/book/v/:slug`)

- Header: logo, name, address, contact, hours summary, GCash details
  (for walk-up payments)
- Court cards: name, sport icon, surface, price/hr, status
  (maintenance shown grayed with reason)
- "Book a court" CTA per court → straight to booking grid

### 3. Pick date + slot (`/book/v/:slug/book`)

**The core screen — optimize hard.**

Layout (mobile-first):

```
[<] Siklab Pickleball Club        [Date: Sat, Nov 15 ▾]
─────────────────────────────────────────────
 Court 1 · Pickleball · ₱400/hr          [info]
 ┌──────┬──────┬──────┬──────┬──────┐
 │ 6 AM │ 7 AM │ 8 AM │ 9 AM │10 AM│  ← horizontally scrollable,
 │ free │ free │BOOKED│ free │ free│    30/60-min columns
 ├──────┼──────┼──────┼──────┼──────┤
 Court 2 ...
```

Alternative simpler layout for MVP: **one court at a time** —
select court card → vertical list of that court's slots for the date.
Grid-of-all-courts is nicer but heavier; ship list-first, grid in
phase 2 if usage demands it.

Slot cell states (color + icon, not color alone):

| State | Look | Tappable |
|---|---|---|
| Free | green tint, price | ✅ |
| Held (someone mid-payment) | amber, "held" | ❌ |
| Booked | gray, "Booked" | ❌ |
| Past | dark gray | ❌ |
| Maintenance/closure | hatched, reason on tap | ❌ |

Tap a free slot → it highlights + duration picker appears
(1h / 1.5h / 2h within tenant min/max) → "Continue" → **server creates
a HOLD** (status `pending_payment`, expires ~15 min) → checkout.

**Multi-court same time (group booking):** phase 2 — "Add another
court at same time" on checkout creates sibling slot rows under one
booking header. Schema already supports it (`book_booking_slots`).

### 4. Checkout (`/book/checkout`)

- Summary card: venue, court(s), date, time, duration, price breakdown
  (subtotal + platform fee if any + total)
- Your details: name, phone (pre-fill if logged in)
- **Payment method choice:**
  - **"Pay via GCash / bank — upload proof"** (Phase 1): shows venue's
    GCash name + number + **exact amount** + optional reference note,
    deep-link button `gcash://` if available, then file upload
    (camera/gallery) + reference number field → "Submit booking"
  - **"Pay online now"** (Phase 2): Xendit invoice → hosted checkout
- Terms: cancellation policy ("Free cancel until 24h before")

On submit → booking created `pending_payment`, slot held →
confirmation screen.

### 5. Confirmation (`/book/confirmation/:ref`)

- Big status chip: **Awaiting payment verification** (proof flow) or
  **Confirmed** (gateway)
- Booking ref + QR code (contains signed ref+pin — venue scans to
  check in)
- "What happens next" explainer (tenant verifies → you get notified)
- Add-to-calendar (.ics) button
- Auto-poll status every ~15s for first few minutes (proof flow);
  realtime subscription if available

### 6. My bookings (`/book/my`)

- Tabs: Upcoming / Past / Cancelled
- Each card: ref, venue, court, date/time, status chip, price, QR
  shortcut, cancel/reschedule button (respecting cutoff)

## Collision handling — the part that MUST be right

### The rule

A slot is unavailable the moment **any** booking holds it in
`held`/`confirmed` status — not just confirmed ones. Two customers
tapping the same free slot within seconds: first gets the hold, second
sees "just booked."

### Enforcement layers

1. **UI layer (fast feedback):** slot grid shows held/booked states;
   availability re-fetched on screen focus.
2. **Hold layer:** selecting a slot creates `pending_payment` hold
   (15-min TTL) — this is what stops double-tap/dwo-device races.
3. **Server layer (the real guard):** every slot insert goes through
   an **atomic check-and-insert** — options, in order of preference:

   | Option | How | Pros/Cons |
   |---|---|---|
   | **Postgres exclusion constraint** | `EXCLUDE USING gist (court WITH =, tsrange WITH &&) WHERE status IN ('held','confirmed')` | Bulletproof, zero app code. Needs DB migration access — Directus doesn't manage it, DBA applies once. **Best long-term.** |
   | **`likha_sql` flow** | custom endpoint/flow does `INSERT ... WHERE NOT EXISTS (overlap)` in one statement | Works within Directus today, bypasses ACL issues. Needs careful SQL. |
   | **Custom Directus endpoint** | extension endpoint does `SELECT ... FOR UPDATE` + insert | Full control, more code to maintain. |
   | **App-side check only** | query then insert | ❌ Race window — two requests both pass. Not acceptable alone. |

   **Plan:** design for the exclusion constraint (cleanest); if DB
   access isn't available at launch, ship `likha_sql` guard and migrate
   to the constraint later — the slot schema doesn't change.

4. **Expiry sweeper:** scheduled Flow (cron, e.g., every 5 min) marks
   `held` slots older than TTL as `released` + booking `expired` —
   frees abandoned checkouts automatically.

### Edge cases to handle in UX

- Customer holds slot A, abandons → slot auto-frees in 15 min; show
  "this hold expires at HH:MM" countdown on checkout.
- Tenant blocks a slot manually (walk-in) → `book_closures` row →
  slot shows "Unavailable — venue".
- Tenant deletes/cancels a confirmed booking → customer gets
  notification + refund instructions (policy per tenant).
- DST/timezone: all venues PH (UTC+8, no DST) — store venue-local
  date+time, convert at boundaries only.

## Notifications (customer-facing)

| Event | Channel |
|---|---|
| Booking submitted | in-app confirmation screen |
| Proof approved/rejected | push notification (we have web-push patterns from Mitmit) + email |
| Booking confirmed | push + email + QR ready |
| Reminder (24h / 1h before) | push/email via scheduled Flow |
| Venue cancelled | push + email + apology/refund note |

## Accessibility & performance notes

- Slot grid must work with screen readers: each cell = button with
  aria-label "Court 1, 9 AM, booked" etc.
- Skeleton loaders on venue/slot fetch; retry on failure with cached
  last-known availability flagged stale.
- Large venue lists: paginate/infinite-scroll; images lazy + sized.
