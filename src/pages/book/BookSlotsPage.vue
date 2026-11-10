<template>
  <q-page class="book-page">
    <div class="book-container">
      <q-inner-loading :showing="loading" />

      <template v-if="bundle">
        <div class="book-header">
          <q-btn flat dense round icon="arrow_back" @click="$router.back()" />
          <div class="col">
            <div class="book-title ellipsis">{{ bundle.tenant.name }}</div>
            <div class="book-subtitle">Pick a date, court &amp; time</div>
          </div>
        </div>

        <!-- date strip -->
        <div class="row no-wrap book-scroll-x q-gutter-sm q-mb-sm">
          <button
            v-for="d in dayOptions" :key="d.value"
            :class="['day-tile', { 'is-active': selectedDate === d.value }]"
            @click="selectedDate = d.value; reloadSlots()"
          >
            <span class="day-dow">{{ d.dow }}</span>
            <span class="day-num">{{ d.num }}</span>
            <span class="day-mon">{{ d.mon }}</span>
          </button>
        </div>

        <!-- court strip -->
        <div class="row no-wrap book-scroll-x q-gutter-sm q-mb-md">
          <button
            v-for="c in bundle.courts" :key="c.id"
            :class="['court-tile', { 'is-active': selectedCourt === c.id }]"
            @click="selectedCourt = c.id"
          >
            <img v-if="c.photo" class="court-thumb" :src="fileUrl(c.photo)" alt="" />
            <span class="court-name">{{ c.name }}</span>
            <span class="court-price">₱{{ fmt(c.price_per_hour) }}/hr</span>
          </button>
        </div>

        <!-- selection mode hint -->
        <div class="row items-center q-gutter-xs q-mb-md">
          <q-icon :name="contiguousOnly ? 'linear_scale' : 'touch_app'" size="18px" color="accent" />
          <span class="text-body2 text-grey-7">
            {{ contiguousOnly
              ? 'Tap a start time, then tap an end time — slots must be consecutive'
              : 'Tap times to select — non-adjacent slots allowed' }}
          </span>
        </div>
        <div v-if="anchor" class="anchor-hint q-mb-md">
          <q-icon name="flag" size="16px" class="q-mr-xs" />
          Start set — now tap the end time. Tap the flagged slot again to cancel.
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

        <!-- selected slots -->
        <div v-if="draftSlots.length" class="selected-panel q-mt-md">
          <div class="text-subtitle2 text-weight-bold q-mb-xs">
            Selected · {{ draftSlots.length }} slot{{ draftSlots.length > 1 ? 's' : '' }}
          </div>
          <q-chip
            v-for="(s, i) in draftSlots" :key="i" dense removable
            color="accent" text-color="white" class="q-mr-xs q-mb-xs"
            @remove="removeDraft(i)"
          >
            {{ s.courtName }} · {{ fmtDate(s.date) }} {{ s.start }}–{{ s.end }}
          </q-chip>
          <div class="row justify-between items-center q-mt-sm">
            <div class="text-body2 text-grey-8">
              Est. total <b class="text-accent">₱{{ fmt(estTotal) }}</b>
            </div>
            <q-btn unelevated rounded color="accent" icon-right="arrow_forward"
              label="Review &amp; pay" @click="goCheckout" />
          </div>
        </div>
      </template>

      <div v-else-if="!loading" class="book-empty">
        <q-icon name="error_outline" size="56px" color="grey-4" class="q-mb-sm" />
        <div class="text-subtitle1 text-weight-medium">Venue not found</div>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  fetchVenueBundle, fetchDaySlots, closureBlocks, hoursFor, peso, fileUrl,
  setDraft, draftSlots, type BookSlot, type DraftSlot,
} from 'src/composables/useBooking';
import { useNotify } from 'src/composables/useNotify';

defineOptions({ name: 'BookSlotsPage' });
const route = useRoute();
const router = useRouter();
const { notify } = useNotify();

const bundle = ref<Awaited<ReturnType<typeof fetchVenueBundle>>>(null);
const loading = ref(true);
const daySlots = ref<BookSlot[]>([]);
const selectedDate = ref('');
const selectedCourt = ref<string | null>(null);
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
    // overlaps an existing booked/held slot?
    const hit = daySlots.value.some((sl) => {
      if (sl.court !== court.id) return false;
      const ss = hm2(sl.start_time), se = hm2(sl.end_time);
      return ss < e && se > s;
    });
    if (hit) state = 'occupied';
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
function handleRangePick(cell: Cell) {
  const courtId = selectedCourt.value;
  if (!courtId) return;
  const date = selectedDate.value;
  const a = anchor.value;
  if (a && a.court === courtId && a.date === date && a.start === cell.start) {
    anchor.value = null; // tapped the flagged start again — cancel
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
  const span = hi - lo;
  anchor.value = null;
  if (span < minDur.value || span > maxDur.value) {
    notify({
      type: 'warning',
      message: `Pick a range between ${durLabel(minDur.value)} and ${durLabel(maxDur.value)}.`,
    });
    return;
  }
  const court = bundle.value!.courts.find((c) => c.id === courtId)!;
  const price = Number(court.price_per_hour) || 0;
  const slots: DraftSlot[] = [];
  for (let t = lo; t + slotStep.value <= hi; t += slotStep.value) {
    slots.push({
      court: courtId, courtName: court.name, date,
      start: toHM2(t), end: toHM2(t + slotStep.value),
      pricePerHour: price || undefined,
    });
  }
  draftSlots.value = [
    ...draftSlots.value.filter((d) => !(d.court === courtId && d.date === date)),
    ...slots,
  ];
}

function removeDraft(i: number) {
  if (contiguousOnly.value) {
    // a run is atomic — removing one chip drops the whole court+date range
    const d = draftSlots.value[i];
    if (d) draftSlots.value = draftSlots.value.filter((x) => !(x.court === d.court && x.date === d.date));
    return;
  }
  draftSlots.value.splice(i, 1);
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
.slot-cell { height: auto !important; padding: 8px 4px; border-radius: 10px; }
.slot-time { font-size: 12px; font-weight: 600; }
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
