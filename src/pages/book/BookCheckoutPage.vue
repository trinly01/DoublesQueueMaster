<template>
  <q-page class="book-page">
    <div class="book-container">
      <q-inner-loading :showing="loading" />

      <template v-if="draftTenant && draftSlots.length && !booking">
        <!-- STEP 1: your details -->
        <div class="book-header">
          <q-btn flat dense round icon="arrow_back" @click="$router.back()" />
          <div class="col">
            <div class="book-title">Your details</div>
            <div class="book-subtitle">Almost there</div>
          </div>
        </div>

        <q-card class="book-card q-mb-md">
          <q-card-section>
            <div class="text-subtitle2 text-weight-bold q-mb-sm">{{ draftTenant.name }}</div>
            <div v-for="(s, i) in draftSlots" :key="i" class="text-body2 q-py-xs">
              {{ s.courtName }} · {{ fmtDate(s.date) }} · {{ s.start }}–{{ s.end }}
            </div>
            <q-separator class="q-my-sm" />
            <div class="text-body2">Est. total <b class="text-accent">₱{{ fmt(estTotal) }}</b></div>
            <div class="text-caption text-grey-6">Final total confirmed after booking.</div>
          </q-card-section>
        </q-card>

        <q-card class="book-card">
          <q-card-section class="q-gutter-sm">
            <q-input v-model="form.name" outlined dense rounded label="Full name *" bg-color="white" />
            <q-input v-model="form.phone" outlined dense rounded label="Mobile number" placeholder="09XX XXX XXXX" bg-color="white" />
            <q-input v-model="form.email" outlined dense rounded label="Email (for booking updates)" type="email" bg-color="white" />
            <q-input v-model="form.notes" outlined dense rounded label="Notes for the venue (optional)" type="textarea" autogrow bg-color="white" />
            <q-btn
              unelevated rounded color="accent" class="full-width q-mt-sm"
              :loading="creating" label="Reserve slots &amp; continue to payment"
              @click="createAndPay"
            />
            <div class="text-caption text-grey-6 text-center">
              Slots are held for ~30 minutes while you pay.
            </div>
          </q-card-section>
        </q-card>
      </template>

      <template v-else-if="booking">
        <!-- STEP 2: pay + upload proof -->
        <div class="book-header">
          <q-btn flat dense round icon="arrow_back" @click="$router.push('/book/my')" />
          <div class="col">
            <div class="book-title">Complete payment</div>
            <div class="book-subtitle">Booking {{ booking.ref }}</div>
          </div>
        </div>

        <q-banner v-if="holdLeft" dense rounded class="q-mb-md"
          :class="holdLeft === 'expired' ? 'bg-red-1 text-red-9' : 'bg-orange-1 text-orange-9'">
          <template #avatar><q-icon :name="holdLeft === 'expired' ? 'error' : 'schedule'" /></template>
          <template v-if="holdLeft === 'expired'">
            Your slot hold expired — please select your slots again.
            <q-btn flat dense color="red-9" label="Pick slots" class="q-ml-sm"
              @click="rebook" />
          </template>
          <template v-else>
            Slots held — complete payment within <b>{{ holdLeft }}</b>
          </template>
        </q-banner>

        <q-card class="book-card q-mb-md">
          <q-card-section>
            <div class="book-section-label q-mb-sm">Pay this amount</div>
            <div class="text-h4 text-weight-bold text-accent">₱{{ fmt(booking.total ?? payment?.amount) }}</div>
            <div class="text-caption text-grey-7 q-mt-xs">
              {{ booking.tenant?.name }} · {{ booking.slots?.length ?? 0 }} slot(s)
            </div>
          </q-card-section>
          <q-separator />
          <q-card-section>
            <div class="book-section-label q-mb-sm">Pay via GCash</div>
            <div class="gcash-box">
              <div v-if="booking.tenant?.gcash_name" class="text-body1">
                Send to: <b>{{ booking.tenant.gcash_name }}</b>
              </div>
              <div v-if="booking.tenant?.gcash_number" class="text-h6 text-weight-bold">
                {{ booking.tenant.gcash_number }}
              </div>
              <q-btn
                v-if="booking.tenant?.gcash_number" outline dense rounded color="green-8"
                icon="content_copy" label="Copy number"
                @click="copyGcash"
              />
            </div>
            <div v-if="booking.tenant?.bank_details" class="text-caption text-grey-7 q-mt-sm">
              {{ booking.tenant.bank_details }}
            </div>
          </q-card-section>
        </q-card>

        <q-card v-if="payment && booking.payment_status !== 'paid'" class="book-card">
          <q-card-section>
            <div class="book-section-label q-mb-sm">Upload proof of payment</div>
            <div class="text-caption text-grey-7 q-mb-sm">
              Screenshot of your GCash receipt — the venue verifies and confirms your slot.
            </div>
            <q-input v-model="proof.sender" outlined dense rounded label="GCash sender name *" class="q-mb-sm" bg-color="white" />
            <q-input v-model="proof.refNo" outlined dense rounded label="Reference / transaction no. (optional)" class="q-mb-sm" bg-color="white" />
            <q-file
              v-model="proof.file" outlined dense rounded label="Receipt screenshot *"
              accept="image/*" max-file-size="5242880" bg-color="white"
            >
              <template #prepend><q-icon name="attach_file" /></template>
            </q-file>
            <q-btn
              unelevated rounded color="accent" class="full-width q-mt-md"
              :loading="submittingProof" label="Submit proof"
              :disable="!proof.file || !proof.sender"
              @click="submitProofForm"
            />
          </q-card-section>
        </q-card>

        <q-card v-else-if="booking.payment_status === 'paid'" class="book-card q-mt-md">
          <q-card-section class="text-center">
            <q-icon name="check_circle" color="positive" size="48px" />
            <div class="text-h6 text-weight-bold q-mt-sm">Payment confirmed!</div>
            <div class="text-body2 text-grey-7">Your booking is confirmed. See you on court.</div>
            <q-btn unelevated rounded color="accent" class="q-mt-md" label="View my bookings"
              @click="$router.push('/book/my')" />
          </q-card-section>
        </q-card>
      </template>

      <div v-else class="book-empty">
        <q-icon name="event_busy" size="56px" color="grey-4" class="q-mb-sm" />
        <div class="text-subtitle1 text-weight-medium">Your booking draft expired or is empty</div>
        <q-btn flat color="accent" label="Browse venues" class="q-mt-sm" @click="$router.push('/book')" />
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  draftTenant, draftSlots, pendingBookingId, clearDraft,
  createBooking, ensurePayment, bookingTotal, submitProof,
  fetchBooking, fetchMyProfile, fetchVenueBundle, fetchDaySlots,
  closureBlocks, hoursFor, peso,
  type BookBookingDetail, type BookPayment, type DraftSlot,
} from 'src/composables/useBooking';
import { useNotify } from 'src/composables/useNotify';

defineOptions({ name: 'BookCheckoutPage' });
const route = useRoute();
const router = useRouter();
const { notify } = useNotify();

const booking = ref<BookBookingDetail | null>(null);
const payment = ref<BookPayment | null>(null);
const loading = ref(false);
const creating = ref(false);
const submittingProof = ref(false);
const holdLeft = ref('');
let holdTimer: ReturnType<typeof setInterval> | null = null;

const form = ref({ name: '', phone: '', email: '', notes: '' });
const proof = ref<{ sender: string; refNo: string; file: File | null }>({ sender: '', refNo: '', file: null });

const estTotal = computed(() =>
  draftSlots.value.reduce((sum, d) => {
    const m = mins(d.end) - mins(d.start);
    return sum + Number(d.pricePerHour ?? 0) * (m / 60);
  }, 0));

const fmt = (n: number | string | null | undefined) => peso(n, 2);
const mins = (t: string) => { const [h, m] = t.slice(0, 5).split(':'); return parseInt(h, 10) * 60 + parseInt(m, 10); };
const dayOfWeek = (d: string) => new Date(`${d}T12:00:00`).getDay();
const fmtDate = (d: string) => {
  const dt = new Date(`${d}T12:00:00`);
  return `${dt.getDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][dt.getMonth()]} ${dt.getFullYear()}`;
};
function startHoldTimer() {
  if (holdTimer) clearInterval(holdTimer);
  holdTimer = setInterval(() => {
    const latest = booking.value?.slots?.map((s) => s.held_until).filter(Boolean) as string[];
    if (!latest.length) { holdLeft.value = ''; return; }
    const soonest = Math.min(...latest.map((t) => new Date(t).getTime()));
    const diff = soonest - Date.now();
    if (diff <= 0) { holdLeft.value = 'expired'; if (holdTimer) clearInterval(holdTimer); return; }
    const m = Math.floor(diff / 60000), s = Math.floor((diff % 60000) / 1000);
    holdLeft.value = `${m}m ${s}s`;
  }, 1000);
}

async function loadBooking(id: string) {
  booking.value = await fetchBooking(id);
  if (booking.value) {
    pendingBookingId.value = id;
    const pays = booking.value.payments ?? [];
    payment.value = pays.length ? pays[pays.length - 1] : null;
    if (booking.value.customer_name) {
      form.value.name = booking.value.customer_name;
      form.value.phone = booking.value.customer_phone ?? '';
      form.value.email = booking.value.customer_email ?? '';
    }
    startHoldTimer();
  }
}

// Re-check venue/courts/hours/closures/occupancy before creating the booking.
// Returns names of draft slots that are no longer bookable (empty = all good).
async function revalidateDraft(): Promise<string[]> {
  const tenant = draftTenant.value;
  if (!tenant) return draftSlots.value.map((s) => s.courtName);
  const bundle = await fetchVenueBundle(tenant.slug);
  if (!bundle) return draftSlots.value.map((s) => s.courtName); // venue suspended/removed
  const activeCourts = new Map(bundle.courts.map((c) => [c.id, c]));

  // group draft slots by court+date for one occupancy fetch each
  const groups = new Map<string, DraftSlot[]>();
  for (const s of draftSlots.value) {
    const k = `${s.court}|${s.date}`;
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  const bad = new Set<string>();
  await Promise.all([...groups.entries()].map(async ([key, slots]) => {
    const [courtId, date] = key.split('|');
    const court = activeCourts.get(courtId);
    if (!court) { slots.forEach((s) => bad.add(s.courtName)); return; }
    const win = hoursFor(bundle.hours, courtId, dayOfWeek(date));
    const booked = await fetchDaySlots([courtId], date);
    for (const s of slots) {
      const a = mins(s.start), b = mins(s.end);
      if (win && (a < win.open || b > win.close)) { bad.add(s.courtName); continue; }
      if (closureBlocks(bundle.closures, courtId, date, a, b)) { bad.add(s.courtName); continue; }
      const hit = booked.some((o) => {
        const oa = mins(o.start_time), ob = mins(o.end_time);
        return oa < b && ob > a;
      });
      if (hit) bad.add(s.courtName);
    }
  }));
  return [...bad];
}

async function createAndPay() {
  if (!form.value.name.trim()) {
    notify({ type: 'negative', message: 'Please enter your full name.' });
    return;
  }
  if (!draftTenant.value || !draftSlots.value.length) return;
  creating.value = true;
  try {
    // availability may have changed since the draft was picked (or restored from storage)
    const gone = await revalidateDraft();
    if (gone.length) {
      notify({
        type: 'warning',
        message: `Some slots are no longer available (${[...new Set(gone)].join(', ')}) — please pick again.`,
      });
      clearDraft();
      router.push(`/book/v/${draftTenant.value.slug}/book`);
      return;
    }
    const b = await createBooking({
      tenantId: draftTenant.value.id,
      customerName: form.value.name.trim(),
      customerPhone: form.value.phone.trim() || undefined,
      customerEmail: form.value.email.trim() || undefined,
      notes: form.value.notes.trim() || undefined,
      slots: draftSlots.value.map((s) => ({ court: s.court, date: s.date, start: s.start, end: s.end })),
    });
    pendingBookingId.value = b.id;
    // createItem doesn't return nested slots — refetch, then check what survived
    await loadBooking(b.id);
    const alive = (booking.value?.slots ?? []).filter((s) => s.status === 'held' || s.status === 'confirmed');
    if (!alive.length) {
      notify({ type: 'negative', message: 'Sorry — those slots were just taken. Please pick another time.' });
      clearDraft();
      router.push(`/book/v/${draftTenant.value.slug}/book`);
      return;
    }
    if (alive.length < draftSlots.value.length) {
      notify({
        type: 'warning',
        message: `Some slots were just taken — your booking now covers ${alive.length} slot${alive.length > 1 ? 's' : ''}.`,
      });
    }
    // ensure a payment record exists with the computed total
    const total = await bookingTotal(b.id);
    if (total > 0) {
      payment.value = await ensurePayment(b.id, total);
      await loadBooking(b.id); // refresh total display
    }
  } catch (e) {
    console.error('booking create failed', e);
    notify({ type: 'negative', message: 'Could not create booking — please try again.' });
  } finally {
    creating.value = false;
  }
}

// hold may have lapsed (or booking cancelled/expired) — verify before uploading proof.
// Returns 'ok' | 'paid' | 'dead'; refreshes booking.value with fresh data.
async function checkBookingState(): Promise<'ok' | 'paid' | 'dead'> {
  if (!booking.value) return 'dead';
  const fresh = await fetchBooking(booking.value.id);
  if (!fresh) return 'dead';
  booking.value = fresh;
  if (fresh.payment_status === 'paid') return 'paid';
  if (fresh.status !== 'pending_payment' && fresh.status !== 'confirmed') return 'dead';
  const now = Date.now();
  const alive = (fresh.slots ?? []).some((s) =>
    s.status === 'confirmed' ||
    (s.status === 'held' && !!s.held_until && new Date(s.held_until).getTime() > now));
  return alive ? 'ok' : 'dead';
}

function rebook() {
  const slug = booking.value?.tenant?.slug ?? draftTenant.value?.slug;
  clearDraft();
  pendingBookingId.value = null;
  router.push(slug ? `/book/v/${slug}/book` : '/book');
}

async function submitProofForm() {
  if (!booking.value || !payment.value || !proof.value.file || !proof.value.sender.trim()) return;
  submittingProof.value = true;
  try {
    const state = await checkBookingState();
    if (state === 'paid') {
      notify({ type: 'info', message: 'This booking is already paid — nothing more to do.' });
      return;
    }
    if (state !== 'ok') {
      notify({ type: 'negative', message: 'Your slot hold expired — please select your slots again.' });
      rebook();
      return;
    }
    await submitProof({
      bookingId: booking.value.id,
      paymentId: payment.value.id,
      file: proof.value.file,
      senderName: proof.value.sender.trim(),
      referenceNo: proof.value.refNo.trim() || undefined,
    });
    notify({ type: 'positive', message: 'Proof submitted — the venue will confirm shortly.' });
    clearDraft();
    router.push(`/book/confirmation/${booking.value.id}`);
  } catch (e) {
    console.error('proof submit failed', e);
    notify({ type: 'negative', message: 'Proof upload failed — please try again.' });
  } finally {
    submittingProof.value = false;
  }
}

async function copyGcash() {
  const num = booking.value?.tenant?.gcash_number;
  if (!num) return;
  try { await navigator.clipboard.writeText(num); notify({ type: 'positive', message: 'GCash number copied' }); }
  catch { notify({ type: 'info', message: num }); }
}

onMounted(async () => {
  const bId = String(route.query.b ?? '');
  if (bId) {
    loading.value = true;
    try { await loadBooking(bId); }
    finally { loading.value = false; }
    return;
  }
  // fresh checkout — prefill profile
  const p = await fetchMyProfile();
  form.value.name = p.name;
  form.value.email = p.email;
});

onUnmounted(() => { if (holdTimer) clearInterval(holdTimer); });
</script>

<style lang="scss" scoped>
.gcash-box {
  background: #e8f5e9;
  border: 1px solid #c8e6c9;
  border-radius: 12px;
  padding: 14px;
}
</style>
