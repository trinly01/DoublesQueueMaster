<template>
  <q-page class="book-page">
    <div class="book-container">
      <q-inner-loading :showing="loading" />

      <template v-if="booking">
        <div class="book-header">
          <q-btn flat dense round icon="arrow_back" @click="$router.back()" />
          <div class="col">
            <div class="book-title ellipsis">{{ tenantName }}</div>
            <div class="book-subtitle ellipsis text-accent text-weight-medium">{{ booking.ref || `#${booking.id}` }}</div>
          </div>
          <q-chip dense unelevated :color="statusColor" text-color="white" size="sm">{{ statusLabel }}</q-chip>
        </div>

        <!-- schedule -->
        <q-card class="book-card q-mb-lg">
          <q-card-section>
            <div class="book-section-label q-mb-sm">Schedule</div>
            <div v-for="g in groupedSlots" :key="g.key" class="draft-group">
              <div class="draft-group-head">
                <span class="draft-court">{{ g.courtName }}</span>
                <span class="draft-meta">{{ fmtDate(g.date) }} · {{ g.hours }}h</span>
              </div>
              <q-chip
                v-for="s in g.items" :key="s.id" dense
                :outline="slotChip(s).outline" :unelevated="!slotChip(s).outline"
                :color="slotChip(s).color" :text-color="slotChip(s).text"
                class="draft-chip" :class="{ 'slot-dead': slotChip(s).dead }"
              >
                {{ fmtTime(s.start_time) }}–{{ fmtTime(s.end_time) }}<template v-if="slotChip(s).dead"> · {{ slotChip(s).label }}</template>
              </q-chip>
            </div>
          </q-card-section>
        </q-card>

        <!-- payment -->
        <q-card class="book-card q-mb-lg">
          <q-card-section>
            <div class="book-section-label q-mb-sm">Payment</div>
            <div class="row justify-between q-py-xs">
              <span class="text-grey-7">Subtotal</span><span>₱{{ fmt(booking.subtotal) }}</span>
            </div>
            <div class="row justify-between q-py-xs">
              <span class="text-grey-7">Total</span><span class="text-weight-bold text-accent">₱{{ fmt(booking.total) }}</span>
            </div>
            <q-separator class="q-my-sm" />
            <div class="row justify-between items-center">
              <span class="text-grey-7">Status</span>
              <q-chip dense unelevated :color="payColor" text-color="white">{{ booking.payment_status.replace(/_/g, ' ') }}</q-chip>
            </div>
            <div v-for="p in booking.payments" :key="p.id" class="text-caption text-grey-6 q-mt-xs">
              {{ p.method }} · ₱{{ fmt(p.amount) }} · {{ p.status }}
            </div>
            <div v-for="pr in booking.proofs" :key="pr.id" class="text-caption q-mt-xs">
              <a :href="fileUrl(pr.file)" target="_blank" class="text-accent">View proof</a>
              <span class="text-grey-6"> — {{ pr.status }}<span v-if="pr.rejection_reason"> ({{ pr.rejection_reason }})</span></span>
            </div>
          </q-card-section>
        </q-card>

        <!-- actions — profile convention: centered column, hero + outline pair -->
        <div class="column items-center q-mt-sm" style="width: 240px; gap: 8px; margin: 0 auto">
          <q-btn
            v-if="canPay" unelevated rounded color="accent" class="full-width"
            :icon="hasProof ? 'cloud_upload' : 'payments'"
            :label="hasProof ? 'Reupload proof' : 'Complete payment'"
            @click="$router.push(`/book/checkout?b=${booking.id}`)"
          />
          <div
            v-if="canCancel || hasBookableSlots"
            class="row full-width" style="gap: 8px"
          >
            <q-btn
              v-if="canCancel" flat color="negative" icon="cancel"
              label="Cancel booking" size="sm" dense rounded no-caps
              align="center" style="flex: 1; border-radius: 12px"
              :loading="cancelling" @click="confirmCancel"
            />
            <q-btn-dropdown
              v-if="hasBookableSlots" flat color="accent" icon="event"
              label="Calendar" size="sm" dense rounded no-caps
              align="center" style="flex: 1; border-radius: 12px"
            >
            <q-list dense>
              <q-item clickable v-close-popup @click="downloadIcs">
                <q-item-section avatar><q-icon name="download" /></q-item-section>
                <q-item-section>Download .ics — all slots</q-item-section>
              </q-item>
              <q-item clickable v-close-popup @click="openGcal">
                <q-item-section avatar><q-icon name="calendar_month" /></q-item-section>
                <q-item-section>Google Calendar</q-item-section>
              </q-item>
            </q-list>
            </q-btn-dropdown>
          </div>
        </div>
        <div v-if="booking.cancel_reason" class="text-caption text-grey-6 q-mt-sm">
          Cancelled: {{ booking.cancel_reason }}
        </div>
      </template>

      <div v-else-if="!loading" class="book-empty">
        <q-icon name="event_busy" size="56px" color="grey-4" class="q-mb-sm" />
        <div class="text-subtitle1 text-weight-medium">Booking not found</div>
        <q-btn flat color="accent" label="My bookings" class="q-mt-sm" @click="$router.push('/book/my')" />
      </div>
    </div>
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
import { ref, computed, onMounted } from 'vue';
import { Dialog } from 'quasar';
import { useRoute } from 'vue-router';
import {
  fetchBooking, cancelBooking, fileUrl, peso, addBookingToCalendar, openGoogleCalendar,
  fetchCourtNames, type BookBookingDetail, type BookSlot,
} from 'src/composables/useBooking';
import { useNotify } from 'src/composables/useNotify';

defineOptions({ name: 'BookBookingPage' });
const route = useRoute();
const { notify } = useNotify();
const booking = ref<BookBookingDetail | null>(null);
const loading = ref(true);
const cancelling = ref(false);
const courtNames = ref(new Map<string, string>());

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmtDate = (d: string) => { const dt = new Date(`${d}T12:00:00`); return `${dt.getDate()} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`; };
const fmtTime = (t: string) => t.slice(0, 5);
const fmt = (n: number | string | null | undefined) => peso(n, 2);
const tenantName = computed(() => booking.value?.tenant?.name ?? '');

const canPay = computed(() =>
  booking.value?.status === 'pending_payment' && booking.value?.payment_status !== 'paid');
const hasProof = computed(() => (booking.value?.proofs ?? []).length > 0);
const canCancel = computed(() =>
  booking.value?.status === 'pending_payment' &&
  !['paid', 'refunded'].includes(booking.value?.payment_status ?? ''));
const hasBookableSlots = computed(() =>
  (booking.value?.slots ?? []).some((s) => s.status !== 'cancelled'));

async function downloadIcs() {
  if (!booking.value) return;
  try { await addBookingToCalendar(booking.value); }
  catch { notify({ type: 'negative', message: 'Nothing to add — no active slots on this booking.' }); }
}
async function openGcal() {
  if (!booking.value) return;
  try { await openGoogleCalendar(booking.value); }
  catch { notify({ type: 'negative', message: 'Nothing to add — no active slots on this booking.' }); }
}

const deadSlot = (s: BookSlot) =>
  s.status === 'cancelled' || s.status === 'released' ||
  (s.status === 'held' && !!s.held_until && new Date(s.held_until).getTime() < Date.now());

const slotChip = (s: BookSlot) => {
  if (deadSlot(s))
    return { color: 'grey-5', text: 'grey-7', outline: false, dead: true,
      label: s.status === 'held' ? 'hold expired' : s.status };
  if (s.status === 'confirmed')
    return { color: 'positive', text: 'white', outline: false, dead: false, label: '' };
  return { color: 'accent', text: 'accent', outline: true, dead: false, label: '' };
};

const groupedSlots = computed(() => {
  const map = new Map<string, { key: string; courtName: string; date: string; items: BookSlot[] }>();
  for (const s of booking.value?.slots ?? []) {
    const key = `${s.court}|${s.date}`;
    let g = map.get(key);
    if (!g) { g = { key, courtName: courtNames.value.get(s.court) ?? 'Court', date: s.date, items: [] }; map.set(key, g); }
    g.items.push(s);
  }
  const groups = [...map.values()];
  for (const g of groups) g.items.sort((a, b) => a.start_time.localeCompare(b.start_time));
  return groups
    .map((g) => ({ ...g, hours: g.items.filter((s) => !deadSlot(s)).length || g.items.length }))
    .sort((a, b) =>
      a.date.localeCompare(b.date) ||
      a.courtName.localeCompare(b.courtName) ||
      a.items[0].start_time.localeCompare(b.items[0].start_time));
});

const allHoldsExpired = computed(() => {
  const slots = booking.value?.slots ?? [];
  return slots.length > 0 && slots.every((s) =>
    s.status === 'held' && s.held_until && new Date(s.held_until).getTime() < Date.now());
});

const statusLabel = computed(() => {
  const b = booking.value; if (!b) return '';
  if (b.status === 'pending_payment' && b.payment_status === 'pending_verification') return 'verifying payment';
  if (b.status === 'pending_payment' && allHoldsExpired.value) return 'hold expired';
  return b.status.replace(/_/g, ' ');
});
const statusColor = computed(() => {
  const s = booking.value?.status ?? '';
  if (s === 'confirmed' || s === 'checked_in') return 'positive';
  if (s === 'pending_payment') return booking.value?.payment_status === 'pending_verification' ? 'orange' : 'blue';
  return 'grey';
});
const payColor = computed(() => {
  const p = booking.value?.payment_status ?? '';
  if (p === 'paid') return 'positive';
  if (p === 'pending_verification') return 'orange';
  return 'grey';
});

function confirmCancel() {
  Dialog.create({
    title: 'Cancel this booking?',
    message: 'Your held slots will be released and this cannot be undone. If you already paid, contact the venue about a refund.',
    cancel: { label: 'Keep booking', color: 'grey' },
    ok: { label: 'Yes, cancel', color: 'negative' },
    persistent: true,
  }).onOk(() => { void doCancel(); });
}

async function doCancel() {
  if (!booking.value) return;
  cancelling.value = true;
  try {
    await cancelBooking(booking.value.id, 'Cancelled by customer');
    notify({ type: 'positive', message: 'Booking cancelled — slots released.' });
    booking.value = await fetchBooking(booking.value.id);
  } catch (e) {
    console.error('cancel failed', e);
    notify({ type: 'negative', message: 'Could not cancel — please try again or contact the venue.' });
  } finally { cancelling.value = false; }
}

onMounted(async () => {
  const id = String(route.params.id ?? '');
  if (id) booking.value = await fetchBooking(id).catch(() => null);
  courtNames.value = await fetchCourtNames(booking.value?.tenant?.id).catch(() => new Map());
  loading.value = false;
});
</script>
