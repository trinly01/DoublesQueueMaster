<template>
  <q-page class="book-page">
    <div class="book-container">
      <div class="book-header">
        <q-btn flat dense round icon="arrow_back" @click="$router.back()" />
        <div class="col">
          <div class="book-title">My bookings</div>
          <div class="book-subtitle">Your court reservations</div>
        </div>
      </div>

      <q-tabs v-model="tab" dense align="left" class="q-mb-md text-accent">
        <q-tab name="upcoming" label="Upcoming" />
        <q-tab name="past" label="Past / cancelled" />
      </q-tabs>

      <q-inner-loading :showing="loading" />

      <div v-if="!loading && !shown.length" class="book-empty">
        <q-icon name="event_note" size="56px" color="grey-4" class="q-mb-sm" />
        <div class="text-subtitle1 text-weight-medium">No bookings here yet</div>
        <q-btn unelevated rounded color="accent" class="q-mt-md" label="Book a court" @click="$router.push('/book')" />
      </div>

      <q-card
        v-for="b in shown" :key="b.id"
        class="book-card booking-card q-mb-sm cursor-pointer"
        @click="$router.push(`/book/my/${b.id}`)"
      >
        <q-card-section class="q-pa-md">
          <div class="row items-center">
            <div class="col">
              <div class="text-subtitle2 text-weight-bold">{{ b.ref || `#${b.id}` }}</div>
              <div class="text-caption text-grey-7">
                {{ slotSummary(b) }}
              </div>
            </div>
            <q-chip dense unelevated :color="statusColor(b)" text-color="white">{{ statusLabel(b) }}</q-chip>
          </div>
          <div class="row justify-between items-center q-mt-xs">
            <span class="text-caption text-grey-6">{{ tenantName(b) }}</span>
            <span class="text-weight-bold text-accent">₱{{ fmt(b.total) }}</span>
          </div>
        </q-card-section>
      </q-card>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { fetchMyBookings, peso, type BookBooking } from 'src/composables/useBooking';

defineOptions({ name: 'BookMyPage' });
const tab = ref('upcoming');
const bookings = ref<BookBooking[]>([]);
const loading = ref(true);

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmtDate = (d: string) => {
  const dt = new Date(`${d}T12:00:00`);
  return `${dt.getDate()} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
};
const fmtTime = (t: string) => t.slice(0, 5);
const fmt = (n: number | string | null | undefined) => peso(n, 2);

const slotSummary = (b: BookBooking) => {
  const s = (b.slots ?? [])[0];
  if (!s) return 'No slots';
  const n = b.slots?.length ?? 1;
  return `${fmtDate(s.date)} ${fmtTime(s.start_time)} · ${n > 1 ? `${n} slots` : '1 slot'}`;
};
const tenantName = (b: BookBooking) => (b.tenant as unknown as { name?: string })?.name ?? '';

const isUpcoming = (b: BookBooking) => {
  if (['cancelled', 'expired', 'rejected', 'no_show', 'completed'].includes(b.status)) return false;
  const s = (b.slots ?? [])[0];
  if (!s?.date) return false;
  const end = new Date(`${s.date}T${s.end_time ?? '23:59'}`);
  return end.getTime() > Date.now();
};

const shown = computed(() =>
  bookings.value.filter((b) => (tab.value === 'upcoming') === isUpcoming(b)));

const statusLabel = (b: BookBooking) => {
  if (b.status === 'pending_payment' && b.payment_status === 'pending_verification') return 'verifying';
  return b.status.replace(/_/g, ' ');
};
const statusColor = (b: BookBooking) => {
  if (b.status === 'confirmed' || b.status === 'checked_in') return 'positive';
  if (b.status === 'pending_payment') return b.payment_status === 'pending_verification' ? 'orange' : 'blue';
  if (b.status === 'cancelled' || b.status === 'expired' || b.status === 'rejected') return 'grey';
  return 'grey-7';
};

onMounted(async () => {
  try { bookings.value = await fetchMyBookings(); }
  catch (e) { console.error('my bookings failed', e); }
  finally { loading.value = false; }
});
</script>

<style lang="scss" scoped>
.booking-card { border: none; }
</style>
