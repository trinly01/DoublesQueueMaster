<template>
  <q-page class="book-page">
    <div class="book-container flex flex-center" style="min-height: 70vh">
      <div class="confirm-box">
        <q-icon name="check_circle" color="positive" size="80px" />
        <div class="book-title text-h5 q-mt-md">Booking received!</div>
        <div v-if="booking?.ref" class="text-h6 text-accent q-mt-xs text-weight-bold">{{ booking.ref }}</div>
        <div class="text-body2 text-grey-7 q-mt-md" style="max-width:340px">
          <template v-if="booking?.payment_status === 'paid' || booking?.status === 'confirmed'">
            Your booking is <b>confirmed</b>. See you on court!
          </template>
          <template v-else>
            We've received your booking and proof. The venue will verify your
            payment and confirm your slot — usually within a few hours.
            You'll get an email update.
          </template>
        </div>

        <q-card v-if="booking" class="book-card q-mt-lg">
          <q-card-section class="text-left">
            <div class="text-subtitle2 text-weight-bold">{{ booking.tenant?.name }}</div>
            <div v-for="s in booking.slots" :key="s.id" class="text-body2 q-py-xs">
              {{ fmtDate(s.date) }} · {{ fmtTime(s.start_time) }}–{{ fmtTime(s.end_time) }}
              <span class="text-grey-6">({{ s.status }})</span>
            </div>
            <q-separator class="q-my-sm" />
            <div class="text-subtitle1 text-weight-bold">Total: <span class="text-accent">₱{{ fmt(booking.total) }}</span></div>
          </q-card-section>
        </q-card>

        <div class="row q-gutter-sm justify-center q-mt-lg">
          <q-btn-dropdown
            v-if="hasBookableSlots" outline rounded color="accent" icon="event"
            label="Add to calendar" no-caps
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
          <q-btn unelevated rounded color="accent" icon="receipt_long" label="My bookings" @click="$router.push('/book/my')" />
          <q-btn outline rounded color="accent" icon="add_circle" label="Book another" @click="$router.push('/book')" />
        </div>
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
import { useRoute } from 'vue-router';
import {
  fetchBooking, peso, addBookingToCalendar, openGoogleCalendar,
  type BookBookingDetail,
} from 'src/composables/useBooking';
import { useNotify } from 'src/composables/useNotify';

defineOptions({ name: 'BookConfirmationPage' });
const route = useRoute();
const booking = ref<BookBookingDetail | null>(null);
const { notify } = useNotify();
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

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmtDate = (d: string) => {
  const dt = new Date(`${d}T12:00:00`);
  return `${dt.getDate()} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
};
const fmtTime = (t: string) => t.slice(0, 5);
const fmt = (n: number | string | null | undefined) => peso(n, 2);

onMounted(async () => {
  const id = String(route.params.id ?? '');
  if (id) booking.value = await fetchBooking(id).catch(() => null);
});
</script>

<style lang="scss" scoped>
.confirm-box { text-align: center; max-width: 480px; width: 100%; }
</style>
