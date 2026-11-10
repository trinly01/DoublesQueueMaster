<template>
  <q-page class="book-page">
    <div class="book-container">
      <q-inner-loading :showing="loading" />

      <template v-if="booking">
        <div class="book-header">
          <q-btn flat dense round icon="arrow_back" @click="$router.back()" />
          <div class="col">
            <div class="book-title">{{ booking.ref || `Booking #${booking.id}` }}</div>
            <div class="book-subtitle">{{ tenantName }}</div>
          </div>
          <q-chip dense unelevated :color="statusColor" text-color="white">{{ statusLabel }}</q-chip>
        </div>

        <!-- schedule -->
        <q-card class="book-card q-mb-md">
          <q-card-section>
            <div class="book-section-label q-mb-sm">Schedule</div>
            <div v-for="s in booking.slots" :key="s.id" class="row justify-between items-center q-py-xs">
              <span>{{ fmtDate(s.date) }} · {{ fmtTime(s.start_time) }}–{{ fmtTime(s.end_time) }}</span>
              <q-chip dense unelevated :color="slotColor(s.status)" text-color="white" size="sm">{{ s.status }}</q-chip>
            </div>
          </q-card-section>
        </q-card>

        <!-- payment -->
        <q-card class="book-card q-mb-md">
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

        <!-- actions -->
        <div class="row q-gutter-sm">
          <q-btn
            v-if="canPay" unelevated rounded color="accent" class="col"
            label="Complete payment" @click="$router.push(`/book/checkout?b=${booking.id}`)"
          />
          <q-btn
            v-if="canCancel" outline rounded color="negative" class="col"
            label="Cancel booking" :loading="cancelling" @click="doCancel"
          />
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
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { fetchBooking, cancelBooking, fileUrl, peso, type BookBookingDetail } from 'src/composables/useBooking';
import { useNotify } from 'src/composables/useNotify';

defineOptions({ name: 'BookBookingPage' });
const route = useRoute();
const { notify } = useNotify();
const booking = ref<BookBookingDetail | null>(null);
const loading = ref(true);
const cancelling = ref(false);

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmtDate = (d: string) => { const dt = new Date(`${d}T12:00:00`); return `${dt.getDate()} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`; };
const fmtTime = (t: string) => t.slice(0, 5);
const fmt = (n: number | string | null | undefined) => peso(n, 2);
const tenantName = computed(() => booking.value?.tenant?.name ?? '');

const canPay = computed(() =>
  booking.value?.status === 'pending_payment' && booking.value?.payment_status !== 'paid');
const canCancel = computed(() =>
  booking.value?.status === 'pending_payment' &&
  !['paid', 'refunded'].includes(booking.value?.payment_status ?? ''));

const statusLabel = computed(() => {
  const b = booking.value; if (!b) return '';
  if (b.status === 'pending_payment' && b.payment_status === 'pending_verification') return 'verifying payment';
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
const slotColor = (s: string) => ({ held: 'blue', confirmed: 'positive', cancelled: 'grey' }[s] ?? 'grey');

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
  loading.value = false;
});
</script>
