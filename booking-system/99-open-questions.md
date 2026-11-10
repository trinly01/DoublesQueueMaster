# 99 — Open Questions & Decisions Needed

Decisions to make before/while building. Ordered by "blocks the most."

## Blocking (need answers before schema freeze)

1. ~~**Tenant isolation: Option A or B?**~~ → **DECIDED & VERIFIED:
   Option A** — shared `book_tenant` role/policy + deep item filters for
   reads, `$CURRENT_USER.book_tenant` validation for writes, presets
   for auto-stamp. Implemented + tested live.
   **Multi-venue staff: SUPPORTED** — `book_tenant` = active venue
   (staff self-switch via profile, validated by
   `{_in: "$CURRENT_USER.book_tenant_ids"}` json mirror synced by the
   `tenant_user_sync` flow). Junctions define all accessible venues;
   creates land in the active venue. Verified: `test-multivenue.mjs` 9/9.

2. **Collision enforcement mechanism**
   Postgres exclusion constraint (needs DBA/migration access) vs
   `likha_sql` guard flow vs custom endpoint. *Recommendation: design
   for exclusion constraint; ship likha_sql guard if no DB access.*
   → **Who has Postgres access** to apply the constraint?

3. ~~**Payment model for MVP**~~ → **DECIDED: Model A** — tenant
   subscription + proof-of-payment; Zyberlab doesn't touch booking money.
   (Model B platform-fee becomes a per-tenant Phase 2 opt-in.)

4. **Guest checkout?**
   Require account (simplest, we have auth) vs allow guest bookings
   (name+phone only, claim later). PH competitors allow guests — but
   guest create-permissions on bookings are riskier. *MVP: account
   required; revisit.*

## Important (shape the build)

5. **Subscription billing mechanics** (Model A locked; tiers added)
   - ~~Price point?~~ → **tiers by court count added** to `book_tenants`
     (`subscription_plan`/`max_courts`/`subscription_status`/
     `subscription_renews_at`/`billing_email`): trial ₱0, starter ₱499
     ≤2 courts, growth ₱999 ≤6, business ₱1,999 unlimited — see
     `04-payments-and-fees.md`. Exact pricing still tunable.
   - **How do tenants pay?** Manual invoicing/remittance vs reuse the
     existing Xendit invoice-link pattern for subscription invoices.
   - Enforcement: manual at MVP (admin vs `max_courts`); automate later.
   - Phase 2 prep (deferred): platform fee flat vs % vs hybrid;
     who absorbs Xendit fees — customer or split?

6. **Hold/expiry timings**
   - Payment hold TTL: 15 min? 30 min? Tenant-configurable?
   - Proof pending expiry: 24h? Until tenant acts?
   - Auto-confirm threshold: trust flag per tenant?

7. **Cancellation policy defaults**
   Free-cancel cutoff (24h?), refund handling for gateway payments,
   who decides refunds — tenant or Zyberlab?

8. **Multi-court bookings in MVP?**
   Schema supports it (booking_slots). UI adds complexity — defer to
   phase 2 unless a launch tenant demands it?

9. **Sports scope at launch**
   Model is sport-agnostic. Launch marketing leads with pickleball —
   but do we onboard non-pickleball venues in MVP?

10. **Tenant onboarding**
    Manual by Zyberlab admin (MVP) vs self-serve signup + approval?
    Self-serve needs public create on `book_tenants` (status=pending)
    — small surface, big growth lever. Phase 2 candidate.

11. **Check-in QR mechanics**
    Signed token (needs secret + verification endpoint) vs plain
    booking ref + PIN vs dynamic barcode? Simplest robust: signed JWT
    in QR + tenant scans → app/Studio verifies. Or venue-side: staff
    opens booking in Studio and taps "check in" — zero crypto needed
    for MVP since tenants have Studio anyway.

12. **Walk-in bookings**
    Tenant creates `source=walk_in` bookings in Studio — supported by
    schema. Do we also want a fast "today's walk-in board" view?
    (Studio list filtered to today + a calendar layout is enough MVP.)

13. **Existing DinkMatch overlap**
    Siklab/Dinkilicious are BOTH clubs in our queue app AND prospective
    booking tenants. Do club members get booking perks? Should venue
    pages link to club open-play sessions? Potential synergy, phase 3.

## Research TODOs (verify before committing)

- [ ] `$CURRENT_USER.<custom field>` in permission item-filters — test on
      api.dinkmatch.club with a scratch collection
- [ ] `likha_sql` availability for customer-triggered booking insert
      (bypasses ACL — confirmed pattern from Mitmit, verify same here)
- [ ] Postgres exclusion constraint feasibility — does our Directus DB
      allow migrations / who owns it?
- [ ] Xendit account status — is the invoice endpoint still live? What
      products are enabled (Invoices? Payment Links? QRPh?)?
- [ ] PayMongo as alternative — compare effective rates on ₱300–500
      baskets (QRPh is the cheapest rail)
- [ ] Directus version on api.dinkmatch.club — `GET /server/info`
      (skills written for 11.x/12.x have version-specific traps)
- [ ] Web-push/email infra — do we have SMTP/push configured, or do
      notifications stay in-app/Studio-only at MVP?

## Explicitly deferred (don't build yet)

- XenPlatform marketplace payouts ($10k + $7.5k/mo — revisit at volume)
- Memberships/packages, promos, reviews, maps/heatmaps
- Tenant white-label branding, custom domains
- Native apps, SMS notifications (email/push first)
- Multi-branch tenants (schema allows, UX deferred)
