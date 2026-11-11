<template>
  <q-page class="book-page">
    <div class="book-container">
      <q-inner-loading :showing="loading" />

      <template v-if="bundle">
        <div class="book-header">
          <q-btn flat dense round icon="arrow_back" @click="$router.push('/book')" />
          <div class="col">
            <div class="book-title ellipsis">{{ bundle.tenant.name }}</div>
            <div class="book-subtitle">Pick a date, court &amp; time</div>
          </div>
        </div>

        <!-- suspended venue: exists but not taking bookings -->
        <q-card v-if="venueUnavailable" class="book-card q-mb-lg">
          <q-card-section class="text-center q-pa-lg">
            <q-icon name="hotel_class" size="52px" color="grey-4" class="q-mb-sm" />
            <div class="text-subtitle1 text-weight-bold">Temporarily unavailable</div>
            <div class="text-body2 text-grey-7 q-mt-xs">
              {{ bundle.tenant.name }} isn't taking bookings right now — please check back later.
            </div>
            <div v-if="bundle.tenant.contact_phone || bundle.tenant.contact_email" class="text-caption text-grey-8 q-mt-sm">
              Contact: {{ [bundle.tenant.contact_phone, bundle.tenant.contact_email].filter(Boolean).join(' · ') }}
            </div>
            <q-btn unelevated rounded color="accent" label="Browse other venues" class="q-mt-md"
              @click="$router.push('/book')" />
          </q-card-section>
        </q-card>

        <template v-else>
        <div class="row items-center no-wrap q-mb-sm">
          <q-icon name="schedule" size="16px" color="grey-7" class="q-mr-xs" />
          <span class="text-caption text-grey-7 ellipsis">{{ hoursLabel }}</span>
          <q-space />
          <q-btn flat dense no-caps color="grey-7" size="sm" icon="event_note" label="My bookings"
            :to="'/book/my'" />
          <q-btn flat dense no-caps color="accent" size="sm" icon="info" label="Venue info"
            :to="`/book/v/${bundle.tenant.slug}`" />
        </div>

        <!-- date strip -->
        <HScroll class="q-mb-sm">
          <button
            v-for="d in dayOptions" :key="d.value"
            :class="['day-tile', { 'is-active': selectedDate === d.value }]"
            @click="selectedDate = d.value; reloadSlots()"
          >
            <span class="day-dow">{{ d.dow }}</span>
            <span class="day-num">{{ d.num }}</span>
            <span class="day-mon">{{ d.mon }}</span>
          </button>
        </HScroll>

        <!-- court strip -->
        <HScroll class="q-mb-md">
          <button
            v-for="c in bundle.courts" :key="c.id"
            :class="['court-tile', { 'is-active': selectedCourt === c.id }]"
            @click="selectedCourt = c.id"
          >
            <span class="court-thumb-wrap">
              <img
                v-if="c.photo" class="court-thumb" :src="fileUrl(c.photo)" alt=""
                @click.stop="photoCourt = c"
              />
              <span v-else class="court-thumb court-thumb-empty" @click.stop="photoCourt = c">
                <q-icon name="sports_tennis" size="26px" color="grey-4" />
              </span>
              <q-icon v-if="c.photo" name="zoom_in" size="14px" class="court-zoom" />
            </span>
            <span class="court-body">
              <span class="court-name">{{ c.name }}</span>
              <span v-if="courtSub(c)" class="court-sub">{{ courtSub(c) }}</span>
              <span class="court-price">₱{{ fmt(c.price_per_hour) }}/hr</span>
            </span>
          </button>
        </HScroll>

        <!-- selection mode hint -->
        <div class="row items-center q-gutter-xs q-mb-md">
          <q-icon :name="contiguousOnly ? 'linear_scale' : 'touch_app'" size="18px" color="accent" />
          <span class="text-body2 text-grey-7">
            {{ contiguousOnly
              ? 'Tap a start time, then an end time — every free slot in between is booked; booked/closed times are skipped'
              : 'Tap times to select — non-adjacent slots allowed' }}
          </span>
        </div>
        <div v-if="anchor" class="anchor-hint q-mb-md">
          <q-icon name="flag" size="16px" class="q-mr-xs" />
          Start set — tap an end time, or tap the flagged slot again for just that one slot.
        </div>

        <!-- grid -->
        <div v-if="windowInfo === 'closed'" class="book-empty">
          <q-icon name="event_busy" size="48px" color="grey-4" class="q-mb-sm" />
          <div class="text-subtitle1 text-weight-medium">Closed on this day</div>
        </div>
        <div v-else-if="windowInfo === 'nohours'" class="book-empty">
          <q-icon name="schedule" size="48px" color="grey-4" class="q-mb-sm" />
          <div class="text-subtitle1 text-weight-medium">Opening hours not published yet</div>
        </div>
        <div v-else class="slot-grid">
          <q-btn
            v-for="cell in gridCells" :key="cell.start"
            dense unelevated rounded
            :class="['slot-cell', cell.cls]"
            :disable="cell.state !== 'free' && cell.state !== 'selected' && cell.state !== 'anchor'"
            @click="toggleSlot(cell)"
          >
            <div class="slot-time">{{ cell.label }}</div>
            <div class="slot-price">₱{{ fmt(cell.price) }}</div>
          </q-btn>
        </div>

        <!-- selected slots — grouped by court + day for easy review -->
        <div v-if="draftSlots.length" class="selected-panel q-mt-md">
          <div class="text-subtitle2 text-weight-bold q-mb-sm">
            Selected · {{ draftSlots.length }} slot{{ draftSlots.length > 1 ? 's' : '' }}
          </div>
          <div v-for="g in groupedDraft" :key="g.key" class="draft-group">
            <div class="draft-group-head">
              <span class="draft-court">{{ g.courtName }}</span>
              <span class="draft-meta">{{ fmtDate(g.date) }} · {{ g.items.length }}h</span>
            </div>
            <q-chip
              v-for="s in g.items" :key="s.start" dense removable outline
              color="accent" text-color="accent" class="draft-chip"
              @remove="removeDraft(s)"
            >
              {{ s.start }}–{{ s.end }}
            </q-chip>
          </div>
          <q-separator class="q-my-sm" />
          <div class="row justify-between items-center">
            <div class="text-body2 text-grey-8">
              Est. total <b class="text-accent">₱{{ fmt(estTotal) }}</b>
            </div>
            <q-btn unelevated rounded color="accent" icon-right="arrow_forward"
              label="Review &amp; pay" @click="goCheckout" />
          </div>
        </div>
        </template>
      </template>

      <div v-else-if="!loading" class="book-empty">
        <q-icon name="error_outline" size="56px" color="grey-4" class="q-mb-sm" />
        <div class="text-subtitle1 text-weight-medium">Venue not found</div>
      </div>
    </div>
    <CourtPhotoDialog v-model:court="photoCourt" />
    <q-page-sticky position="bottom-left" :offset="[18, 18]">
      <q-btn round icon="person" color="accent" @click="$router.push('/')">
        <q-tooltip anchor="top middle" self="bottom middle" :offset="[8, 8]"
          >Profile</q-tooltip
        >
      </q-btn>
    </q-page-sticky>

  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  fetchVenueBundle, fetchDaySlots, closureBlocks, hoursFor, peso, fileUrl,
  setDraft, draftSlots, type BookSlot, type BookCourt, type DraftSlot,
} from 'src/composables/useBooking';
import HScroll from 'src/components/HScroll.vue';
import CourtPhotoDialog from 'src/components/CourtPhotoDialog.vue';
import { useNotify } from 'src/composables/useNotify';

defineOptions({ name: 'BookSlotsPage' });
const route = useRoute();
const router = useRouter();
const { notify } = useNotify();

const bundle = ref<Awaited<ReturnType<typeof fetchVenueBundle>>>(null);
const venueUnavailable = computed(() => bundle.value != null && bundle.value.tenant.status !== 'active');
const loading = ref(true);
const daySlots = ref<BookSlot[]>([]);
const selectedDate = ref('');
const selectedCourt = ref<string | null>(null);
const photoCourt = ref<BookCourt | null>(null);
const anchor = ref<{ court: string; date: string; start: number } | null>(null);

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const dayOptions = computed(() => {
  const out = [];
  const now = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out.push({ value: v, dow: DAY_NAMES[d.getDay()], num: d.getDate(), mon: MONTHS[d.getMonth()] });
  }
  return out;
});

const tenant = computed(() => bundle.value?.tenant);
const slotStep = computed(() => tenant.value?.slot_minutes || 60);
const minDur = computed(() => tenant.value?.min_duration || 60);
const maxDur = computed(() => tenant.value?.max_duration || 1440);
// venue rule: consecutive slots only unless the tenant explicitly allows gaps
const contiguousOnly = computed(() => bundle.value?.tenant?.allow_non_contiguous_slots !== true);

const durLabel = (mins: number) => (mins >= 60 ? `${mins / 60}h` : `${mins}m`);

// one-line hint so customers can tell courts apart while picking
const courtSub = (c: BookCourt) =>
  [c.surface, (c.description ?? '').split('\n')[0]].filter(Boolean).join(' · ');

const hoursLabel = computed(() => {
  const w = windowInfo.value;
  if (w === 'closed') return selectedCourt.value ? 'Closed this day' : 'Select a court';
  if (w === 'nohours') return 'Hours not published';
  return `Open ${toHM2(w.open)}–${toHM2(w.close)}`;
});

// operating window: 'closed' | 'nohours' | {open,close}
const windowInfo = computed<'closed' | 'nohours' | { open: number; close: number }>(() => {
  if (!bundle.value || selectedCourt.value == null || !selectedDate.value) return 'closed';
  const dow = new Date(`${selectedDate.value}T12:00:00`).getDay();
  const hasAnyHours = bundle.value.hours.length > 0;
  if (!hasAnyHours) return { open: 6 * 60, close: 23 * 60 }; // unconfigured venue: generous default
  const w = hoursFor(bundle.value.hours, selectedCourt.value, dow);
  return w ?? 'closed';
});

interface Cell { start: number; end: number; label: string; price: number; state: 'free' | 'occupied' | 'closed' | 'selected' | 'anchor'; cls: string }

// minutes-since-midnight *today* (-1 when viewing a future day) — slots whose
// start time has already passed are not bookable
const nowMins = computed(() => {
  const n = new Date();
  const today = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  return selectedDate.value === today ? n.getHours() * 60 + n.getMinutes() : -1;
});

const gridCells = computed<Cell[]>(() => {
  const w = windowInfo.value;
  if (typeof w === 'string' || selectedCourt.value == null) return [];
  const court = bundle.value!.courts.find((c) => c.id === selectedCourt.value);
  if (!court) return [];
  const cells: Cell[] = [];
  // each cell is one booking quantum (venue slot_minutes) — no overlaps
  for (let s = w.open; s + slotStep.value <= w.close; s += slotStep.value) {
    const e = s + slotStep.value;
    const label = `${toHM2(s)}–${toHM2(e)}`;
    const price = Number(court.price_per_hour ?? 0) * (slotStep.value / 60);
    let state: Cell['state'] = 'free';
    // slot start already in the past?
    if (nowMins.value >= 0 && s <= nowMins.value) state = 'occupied';
    else if (daySlots.value.some((sl) => {
      if (sl.court !== court.id) return false;
      const ss = hm2(sl.start_time), se = hm2(sl.end_time);
      return ss < e && se > s;
    })) state = 'occupied';
    else if (closureBlocks(bundle.value!.closures, court.id, selectedDate.value, s, e)) state = 'closed';
    else if (draftSlots.value.some((d) =>
      d.court === court.id && d.date === selectedDate.value && hm2(`${d.start}:00`) < e && hm2(`${d.end}:00`) > s)) {
      state = 'selected';
    } else if (anchor.value && anchor.value.court === court.id &&
      anchor.value.date === selectedDate.value && anchor.value.start === s) {
      state = 'anchor';
    }
    cells.push({
      start: s, end: e, label, price, state,
      cls: state === 'selected' ? 'slot-selected'
        : state === 'anchor' ? 'slot-anchor'
        : state === 'free' ? 'slot-free' : 'slot-blocked',
    });
  }
  return cells;
});

function toggleSlot(cell: Cell) {
  if (contiguousOnly.value) return handleRangePick(cell);
  if (cell.state === 'selected') {
    // remove matching draft slot
    const idx = draftSlots.value.findIndex((d) =>
      d.court === selectedCourt.value && d.date === selectedDate.value &&
      hm2(`${d.start}:00`) === cell.start && hm2(`${d.end}:00`) === cell.end);
    if (idx >= 0) draftSlots.value.splice(idx, 1);
    return;
  }
  if (cell.state !== 'free') return;
  const court = bundle.value!.courts.find((c) => c.id === selectedCourt.value)!;
  draftSlots.value.push({
    court: court.id, courtName: court.name, date: selectedDate.value,
    start: toHM2(cell.start), end: toHM2(cell.end),
    pricePerHour: Number(court.price_per_hour) || undefined,
  });
}

// contiguous-only venues: tap start cell, then end cell → one run of step-sized slots.
// Replaces any existing run for the same court+date so gaps can't form.
// Duration limits apply to booked minutes (free cells only), not the window span —
// unavailable cells inside the range are skipped, never booked.
function handleRangePick(cell: Cell) {
  const courtId = selectedCourt.value;
  if (!courtId) return;
  const date = selectedDate.value;
  const a = anchor.value;
  const durOk = (mins: number) => mins >= minDur.value && mins <= maxDur.value;
  const durWarn = () => notify({
    type: 'warning',
    message: `Pick between ${durLabel(minDur.value)} and ${durLabel(maxDur.value)} of court time.`,
  });
  const commit = (slots: DraftSlot[]) => {
    draftSlots.value = [
      ...draftSlots.value.filter((d) => !(d.court === courtId && d.date === date)),
      ...slots,
    ];
  };

  // second tap on the flagged start = commit just that one slot
  if (a && a.court === courtId && a.date === date && a.start === cell.start) {
    anchor.value = null;
    if (cell.state !== 'anchor') return;
    if (!durOk(slotStep.value)) { durWarn(); return; }
    const court0 = bundle.value!.courts.find((c) => c.id === courtId)!;
    commit([{
      court: courtId, courtName: court0.name, date,
      start: toHM2(cell.start), end: toHM2(cell.start + slotStep.value),
      pricePerHour: Number(court0.price_per_hour) || undefined,
    }]);
    return;
  }
  if (cell.state === 'selected') {
    // tapping inside a committed run clears the whole run for this court+date
    draftSlots.value = draftSlots.value.filter((d) => !(d.court === courtId && d.date === date));
    anchor.value = null;
    return;
  }
  if (cell.state !== 'free') return;
  if (!a || a.court !== courtId || a.date !== date) {
    anchor.value = { court: courtId, date, start: cell.start };
    return;
  }
  const lo = Math.min(a.start, cell.start);
  const hi = Math.max(a.start, cell.start) + slotStep.value;
  anchor.value = null;

  // Book every selectable cell in the range; booked/closed cells are skipped
  // (unavailable inventory can't be booked anyway — free cells are never skipped)
  const cellMap = new Map(gridCells.value.map((c) => [c.start, c]));
  const court = bundle.value!.courts.find((c) => c.id === courtId)!;
  const price = Number(court.price_per_hour) || 0;
  const slots: DraftSlot[] = [];
  let skipped = 0;
  for (let t = lo; t + slotStep.value <= hi; t += slotStep.value) {
    const st = cellMap.get(t)?.state;
    if (st === 'occupied' || st === 'closed' || st == null) { skipped++; continue; }
    slots.push({
      court: courtId, courtName: court.name, date,
      start: toHM2(t), end: toHM2(t + slotStep.value),
      pricePerHour: price || undefined,
    });
  }
  if (!slots.length) {
    notify({ type: 'warning', message: 'No available slots in that range.' });
    return;
  }
  if (!durOk(slots.length * slotStep.value)) { durWarn(); return; }
  if (skipped) {
    notify({ type: 'info', message: `${skipped} booked/closed slot${skipped > 1 ? 's' : ''} skipped.` });
  }
  commit(slots);
}

const groupedDraft = computed(() => {
  const map = new Map<string, { key: string; courtName: string; date: string; items: DraftSlot[] }>();
  for (const s of draftSlots.value) {
    const key = `${s.court}|${s.date}`;
    let g = map.get(key);
    if (!g) { g = { key, courtName: s.courtName, date: s.date, items: [] }; map.set(key, g); }
    g.items.push(s);
  }
  const groups = [...map.values()];
  for (const g of groups) g.items.sort((a, b) => a.start.localeCompare(b.start));
  return groups.sort((a, b) =>
    a.date.localeCompare(b.date) ||
    a.courtName.localeCompare(b.courtName) ||
    a.items[0].start.localeCompare(b.items[0].start));
});

function removeDraft(s: DraftSlot) {
  if (contiguousOnly.value) {
    // a run is atomic — removing one chip drops the whole court+date range
    draftSlots.value = draftSlots.value.filter((x) => !(x.court === s.court && x.date === s.date));
    return;
  }
  const i = draftSlots.value.indexOf(s);
  if (i >= 0) draftSlots.value.splice(i, 1);
}

const estTotal = computed(() =>
  draftSlots.value.reduce((sum, d) => {
    const mins = hm2(`${d.end}:00`) - hm2(`${d.start}:00`);
    return sum + Number(d.pricePerHour ?? 0) * (mins / 60);
  }, 0));

const fmt = (n: number | string | null | undefined) => peso(n);
const fmtDate = (d: string) => {
  const dt = new Date(`${d}T12:00:00`);
  return `${dt.getDate()} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
};
const hm2 = (t: string) => { const [h, m] = t.split(':'); return parseInt(h, 10) * 60 + parseInt(m, 10); };
const toHM2 = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

async function reloadSlots() {
  if (!bundle.value || !selectedCourt.value) { daySlots.value = []; return; }
  daySlots.value = await fetchDaySlots(
    bundle.value.courts.map((c) => c.id), selectedDate.value);
  reconcileDraft();
}

// Drafts persist across sessions — prune entries for the viewed court+date
// that are no longer selectable (booked/closed/outside hours since picking).
// Other court+date combos are checked when the user views them or at checkout.
function reconcileDraft() {
  const b = bundle.value, courtId = selectedCourt.value, date = selectedDate.value;
  if (!b || !courtId || !date) return;
  const affected = draftSlots.value.some((d) => d.court === courtId && d.date === date);
  if (!affected) return;

  const w = windowInfo.value;
  const wOpen = typeof w === 'object' ? w.open : 0;
  const wClose = typeof w === 'object' ? w.close : 24 * 60;
  const dayClosed = w === 'closed' || w === 'nohours';
  const blocked = (s: number, e: number) =>
    daySlots.value.some((sl) =>
      sl.court === courtId && hm2(sl.start_time) < e && hm2(sl.end_time) > s)
    || closureBlocks(b.closures, courtId, date, s, e);

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const nowM = now.getHours() * 60 + now.getMinutes();
  const badIdx = new Set<number>();
  draftSlots.value.forEach((d, i) => {
    if (d.court !== courtId || d.date !== date) return;
    const s = hm2(`${d.start}:00`), e = hm2(`${d.end}:00`);
    const past = d.date < today || (d.date === today && s <= nowM);
    if (dayClosed || past || s < wOpen || e > wClose || blocked(s, e)) badIdx.add(i);
  });
  if (!badIdx.size) return;

  if (contiguousOnly.value) {
    // a run is atomic — one bad cell invalidates the whole court+date run
    draftSlots.value = draftSlots.value.filter((d) => !(d.court === courtId && d.date === date));
  } else {
    draftSlots.value = draftSlots.value.filter((_, i) => !badIdx.has(i));
  }
  notify({ type: 'warning', message: 'Some selected slots are no longer available and were removed.' });
}

function goCheckout() {
  if (!bundle.value || !draftSlots.value.length) return;
  setDraft(bundle.value.tenant, [...draftSlots.value]);
  router.push('/book/checkout');
}

watch(selectedCourt, () => { anchor.value = null; reloadSlots(); });
watch(selectedDate, () => { anchor.value = null; });

onMounted(async () => {
  try {
    bundle.value = await fetchVenueBundle(String(route.params.slug));
    if (bundle.value) {
      const q = String(route.query.court ?? '');
      selectedCourt.value = bundle.value.courts.some((c) => c.id === q)
        ? q : bundle.value.courts[0]?.id ?? null;
      selectedDate.value = dayOptions.value[0].value;
      await reloadSlots();
    }
  } catch (e) {
    console.error('slots load failed', e);
  } finally {
    loading.value = false;
  }
});
</script>

<style lang="scss" scoped>
.slot-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; }
.slot-cell { height: auto !important; padding: 9px 4px; border-radius: 10px; }
.slot-cell :deep(.q-btn__content) { flex-direction: column; line-height: 1.25; }
.slot-time { font-size: 12.5px; font-weight: 700; white-space: nowrap; }
.slot-price { font-size: 11px; opacity: .8; }
.slot-free {
  background: #e8f5e9;
  color: #1b5e20;
  border: 1px solid #c8e6c9;
}
.slot-selected { background: #764ba2; color: #fff; }
.slot-anchor {
  background: #fff;
  color: #764ba2;
  border: 2px dashed #764ba2;
}
.slot-blocked { background: #eceff1; color: #90a4ae; }
.anchor-hint {
  display: flex;
  align-items: center;
  background: rgba(118, 75, 162, 0.08);
  border: 1px solid rgba(118, 75, 162, 0.25);
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 13px;
  color: #5b3a8e;
}
.selected-panel {
  background: linear-gradient(135deg, rgba(118, 75, 162, 0.06), rgba(102, 126, 234, 0.06));
  border: 1px solid rgba(118, 75, 162, 0.18);
  border-radius: 16px;
  padding: 14px;
}

</style>
