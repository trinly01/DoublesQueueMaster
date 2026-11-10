# 08 — Studio Configuration Spec (layouts + flows)

How we configure Directus so tenants succeed **without custom admin UI**.
Two mechanisms do all the work:

1. **Field meta** (`directus_fields.meta`): `group`, `sort`, `width`
   (`full`/`half`/`fill`), `note`, `hidden`, `readonly`, `required`,
   `conditions`, `interface`+`options`, `display`+`display_options`.
   Applied via `PATCH /fields/{collection}/{field}` — scriptable.
2. **Flows**: event + schedule triggers driving `likha_sql` / item ops —
   the automation layer tenants never see.

Verified on this instance: meta keys `special/interface/options/display/
display_options/readonly/hidden/sort/width/translations/note/conditions/
required/group` all present (checked `club` collection fields).

Group interfaces available in core Directus (verify once in Studio):
`group-detail` (titled section), `group-accordion` (collapsible),
`group-tabs` (tab). Fields join a group via `meta.group` = group's
field key. Alias group fields are `type:"alias"`, `meta.special:["group"]`-style
rows created through the Data Model UI or `POST /fields` with
`type:"alias"` + `schema:null` + `meta.interface:"group-*"`.

---

## Part 1 — Form layouts (per collection)

Notation: `G:` = group field · `→` = child field · `½`/`1` = width.
Tabs (`group-tabs`) at top level; `group-detail` for sections inside.

### `book_tenants` — Zyberlab admin owns; tenant sees own record

Tabs:

| Tab | Fields (½ unless noted) |
|---|---|
| **Venue** | name `1` · slug `½` · status `½` (readonly for tenant) · logo `½` · description `1` |
| **Location** | address `1` · latitude `½` · longitude `½` · contact_phone `½` · contact_email `½` |
| **Payments** | gcash_name `½` · gcash_number `½` · bank_details `1` — note: "What customers pay via GCash" |
| **Booking rules** | timezone `½` · currency `½` (readonly) · slot_minutes `½` · min_duration `½` · max_duration `½` · buffer_minutes `½` · cancel_cutoff_hours `½` · auto_confirm_payments `½` (toggle) |
| **Advanced** | settings `1` (json — admin only, hidden from tenant) |

Notes: `slot_minutes` → "Grid step customers pick from (30 or 60)";
`buffer_minutes` → "Gap between bookings for turnover";
`auto_confirm_payments` → "ON = bookings confirm instantly on proof upload (trust mode)".

### `book_courts` — tenant's most-used form

Single page, `group-detail` sections (no tabs — it's short):

- **Court**: name `1` · sport `½` (m2o dropdown, display=name) ·
  surface `½` (select: indoor/outdoor/hard/grass/synthetic) ·
  status `½` · price_per_hour `½` (note "Per hour, PHP") ·
  peak_multiplier `½` · sort `½`
- **Photos**: photos `1` (file-multiple-image interface)
- **About**: description `1`

Hidden for tenant: `tenant` (auto via preset/permission).
Notes: `status` → "Maintenance hides from booking, keeps history";
`price_per_hour` → "Flat rate — time-based rates come in Phase 2".

### `book_bookings` — daily driver

Tabs:

| Tab | Fields |
|---|---|
| **Booking** | ref `½` (readonly) · customer_name `½` · customer_phone `½` · customer_email `½` · source `½` (readonly) · status `½` (select, tenant-editable) · payment_status `½` (readonly — flows own it) · notes `1` |
| **Schedule** | slots `1` — **O2M inline table**: court, date, start_time, end_time, price, status. This is where tenants SEE what's booked. |
| **Money** | payments `1` O2M · proofs `1` O2M (accordion below) |
| **Internal** | internal_notes `1` · checked_in_at `½` · cancelled_at `½` · cancel_reason `½` · subtotal `½` `1` platform_fee `½` tenant_payout `½` total `½` — **admin-only fields hidden from tenant role** |

Preset (walk-in create): `source=walk_in`, `status=confirmed`,
`payment_status=paid`.

### `book_booking_slots` — mostly edited inside booking detail

Fields `½`: court · date · start_time · end_time · duration_minutes
(readonly, derived) · price · status.
Add `held_until` timestamp `½` (hold expiry — needed by sweeper flow;
**add to `03-data-model.md`**).

### `book_payment_proofs` — the verification queue

`group-detail` "Proof":
- booking `½` · payment `½` · file `1` (**image interface, large preview**)
- **Details**: sender_name `½` · reference_no `½` · sent_at `½`
- **Review**: status `½` (pending→approved/rejected) ·
  rejection_reason `1` (**condition: show only when status=rejected**) ·
  reviewed_by `½` + reviewed_at `½` (readonly, auto)

### `book_payments`

booking `½` · method `½` (select w/ choices) · amount `½` · status `½` ·
reference `½` · paid_at `½` · receipt_file `½`.
Admin-only: platform_fee, tenant_payout, xendit_* fields.

### `book_opening_hours`

day_of_week `½` (select Sun–Sat) · open_time `½` · close_time `½` ·
closed `½` (toggle). `tenant` hidden.

### `book_closures`

court `½` (m2o, note "empty = whole venue") · date `½` OR
date_start `½` + date_end `½` · all_day `½` (toggle) ·
start_time `½` · end_time `½` · reason `1`.

### `book_tenant_users`

user `½` (m2o→directus_users, template `{{first_name}} {{last_name}} — {{email}}`)
· role `½` (select: owner/manager/front_desk) · tenant hidden.

### `book_sport_types` (admin-only)

name `½` · icon `½` · sort `½`.

---

## Part 2 — List views & display templates

| Collection | Display template | Default sort | Saved views (tenant) |
|---|---|---|---|
| book_bookings | `{{ref}} · {{customer_name}}` | date_start ↓ | Today · Needs verification · This week · Terminal |
| book_courts | `{{name}} — {{sport.name}}` | sort | Active · Maintenance |
| book_payment_proofs | `{{booking.ref}} · {{sender_name}} · ₱{{payment.amount}}` | sent_at ↑ (FIFO) | Pending · Approved · Rejected |
| book_closures | `{{reason}} · {{date_start}}` | date_start | Upcoming · Past |
| book_opening_hours | `Day {{day_of_week}}` | day_of_week | — |
| book_payments | `{{booking.ref}} · ₱{{amount}} · {{method}}` | paid_at ↓ | Paid · Pending · Refunded |

Interface choices that matter: `file`→image preview for proofs/receipts;
`datetime` with 24h for sent_at; `tags` for bank_details if multi-line;
`select-dropdown-m2o` with `options.template` for user/court pickers.

---

## Part 2b — Navigation folder (LIVE — applied via API)

**How groups work on this instance** (verified, differs from stock
assumptions): `directus_collections.meta.group` is a **FK to
`directus_collections.collection`** — a nav group IS a collection. The
anchor collection renders as the folder header and its `meta.icon`/
`meta.note` dress it up. `meta.sort` orders children *within* each
group (per-group sequence, not global). `meta.hidden` on the anchor
hides the **entire group** — never hide the anchor.

**Live config:**

- Anchor collection: `booking` — singleton, icon `bookmark`, visible.
  (Clicking it opens an empty singleton form; harmless — it's the
  folder header. Could later hold platform-wide booking settings.)
- All 10 `book_*` collections have `meta.group = "booking"`.

Nav order inside the folder = tenant daily-use frequency:

| sort | collection | why |
|---|---|---|
| 1 | book_bookings | daily driver — the hub |
| 2 | book_payment_proofs | verification queue — #1 tenant task |
| 3 | book_courts | inventory/pricing |
| 4 | book_payments | money trail |
| 5 | book_booking_slots | mostly edited inside bookings |
| 6 | book_closures | occasional |
| 7 | book_opening_hours | setup, rarely touched |
| 8 | book_tenant_users | staff list |
| 9 | book_tenants | tenant sees own record only |
| 10 | book_sport_types | Zyberlab-admin catalog |

Re-apply via `PATCH /collections/{name}` `{"meta":{"group":"booking","sort":N}}`
— full meta merge, other meta keys preserved.

---

## Part 3 — Flow automation spec

All flows created by Zyberlab admin. **Customer-facing writes MUST use
`likha_sql`** (bypasses ACL — customer role can't update bookings
directly); tenant-facing flows can use item ops under tenant role but
`$full`/likha_sql is safer. Traps from Mitmit notes apply: event flows
need `options.scope`=event names + `collections`; write-backs set
`emitEvents:false`.

### F1 `booking_ref_assign` — event: `items.create` on book_bookings — ✅ LIVE

**Verified trigger shape** (`items.create`):
`$trigger = {event, payload: <request body — NO id>, key: <new PK>, collection}`
→ the new row's PK is **`$trigger.key`**, not `payload.id` (that binding
was the original `invalid input syntax for integer: "undefined"` bug).

Implemented as 2 ops: `normalize` (exec — resolves `key ?? payload.keys[0]
?? payload.id ?? payload.item.id`, returns `{itemId}`) → `assign_ref`
(likha_sql):
```sql
UPDATE book_bookings SET ref = 'BK-' || to_char(now(),'YYYY') || '-' || lpad(id::text,4,'0')
 WHERE id = ? AND (ref IS NULL OR ref = '')
```
Verified live: booking id=10 → `BK-2026-0010`. *(Spec had proposed a
count-based ref — id-based is race-free, keep it.)*

### F2 `slot_price_snapshot` — event: `items.create` on book_booking_slots

Compute `price = court.price_per_hour × duration/60` (peak multiplier
phase 2) via likha_sql → update slot. Keeps client from setting price.

### F3 `booking_totals` — event: `items.create`/`update` on book_booking_slots

Recompute header `subtotal = Σ slot.price`, `total = subtotal +
platform_fee(0 at MVP)` → update booking. Runs on every slot change.

### F4 `proof_approved` — event: `items.update` on book_payment_proofs

Condition: `{{$trigger.payload.status}} === 'approved'`:
1. **Guard first (likha_sql):** slot still bookable? — booking status
   still `pending_payment`, slots not already `confirmed`/`released`,
   no competing `confirmed` booking on same court+date+time. If guard
   fails → revert proof to `pending` + flag for tenant (prevents
   confirming over a newer booking — the "both paid" race).
2. **Supersede:** auto-reject this booking's OTHER `pending` proofs
   (duplicate uploads) so the queue stays clean.
3. likha_sql/items.update: payment → `status=paid`, `paid_at=now()`
4. booking → `payment_status=paid`; if tenant.auto_confirm →
   `status=confirmed` + all slots `held→confirmed`
5. `emitEvents:false` on write-backs; fires F5 via booking update

**Double-payment scenario:** if two customers paid for the same slot
(hold expired mid-verification, or out-of-order approval), first
approval wins; tenant rejects the loser with reason — refund is the
venue's job via their own GCash (Model A: we never hold the money).
Audit trail stays in `book_payments`/`book_payment_proofs`.

### F5 `proof_rejected` — same trigger, status=`rejected`

booking stays `pending_payment`; customer notified with
`rejection_reason` (F8).

### F6 `slot_hold_expire` — **schedule every 5 min**

likha_sql atomic sweep:
```sql
UPDATE book_booking_slots SET status='released'
WHERE status='held' AND held_until < now();
-- then expire bookings with no remaining held/confirmed slots:
UPDATE book_bookings SET status='expired'
WHERE status='pending_payment'
  AND NOT EXISTS (SELECT 1 FROM book_booking_slots s
                  WHERE s.booking_id=book_bookings.id
                  AND s.status IN ('held','confirmed'));
```
*(Add `held_until` to slots — default `now()+30min` set by F7.)*

### F7 `booking_hold_init` — event: `items.create` on book_booking_slots

Set `held_until = now() + interval '30 minutes'` (tenant-configurable
later via `book_tenants.settings`).

### F8 `customer_notify` — event: `items.update` on book_bookings

Fire-and-forget notifications on status transitions:
- →`confirmed`: "Booking BK-… confirmed — show QR at venue"
- →`expired`: "Payment window expired — slot released"
- →`cancelled`: reason included
Mechanism: email op if SMTP configured, else in-app notification row /
webhook to our notify endpoint — **verify available ops on instance**.

### F9 `tenant_proof_alert` — event: `items.create` on book_payment_proofs

Notify tenant contact_email / owner users: "New payment proof for
BK-… — verify in Studio". Same mechanism question as F8.

### F10 `reminder_24h` — schedule hourly

likha_sql finds `confirmed` bookings with slot date = tomorrow →
notification "Reminder: your booking tomorrow at HH:MM".

### F11 `reminder_1h` — schedule every 15 min

Same for today + start within 60 min.

### F12 `no_show_sweeper` — schedule daily (e.g. 23:00 PHT)

`confirmed` bookings past their last slot end + 30min grace, never
`checked_in` → `status=no_show`.

### F13 `collision_guard` — event: `items.create`/`update` on book_booking_slots

likha_sql pre-check (defense-in-depth behind DB exclusion constraint):
```sql
SELECT 1 FROM book_booking_slots s
JOIN book_booking_slots n ON n.court_id = s.court_id AND n.id != NEW.id
WHERE s.date = NEW.date
  AND s.status IN ('held','confirmed')
  AND s.start_time < NEW.end_time AND s.end_time > NEW.start_time
  AND (buffer overlap included via widened range)
LIMIT 1;
```
Non-empty → throw/return error to reject the write.
*(Exact enforcement TBD — see `99-open-questions.md` Q2.)*

### F14 `walk_in_guard` — event: `items.create` on book_bookings

Tenant-created bookings (`source=walk_in`) skip hold/payment flows —
set `payment_status=paid`, slots `confirmed` directly.

---

## Part 4 — What stays manual (by design)

- Tenant onboarding (Zyberlab admin creates tenant + courts + user)
- Subscription invocollection (Model A — manual or Xendit invoice link,
  decided separately)
- Payouts to tenants (Phase 2+)
- Proof approval edge cases (tenant judgment call)
