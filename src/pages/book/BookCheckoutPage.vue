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

        <q-card class="book-card q-mb-lg">
          <q-card-section>
            <div class="text-subtitle2 text-weight-bold q-mb-sm">{{ draftTenant.name }}</div>
            <div v-for="g in groupedDraft" :key="g.key" class="draft-group">
              <div class="draft-group-head">
                <span class="draft-court">{{ g.courtName }}</span>
                <span class="draft-meta">{{ fmtDate(g.date) }} · {{ g.items.length }}h</span>
              </div>
              <q-chip
                v-for="s in g.items" :key="s.start" dense outline
                color="accent" text-color="accent" class="draft-chip"
              >
                {{ s.start }}–{{ s.end }}
              </q-chip>
            </div>
            <q-separator class="q-my-sm" />
            <div class="text-body2">Est. total <b class="text-accent">₱{{ fmt(estTotal) }}</b></div>
            <div class="text-caption text-grey-6">Final total confirmed after booking.</div>
          </q-card-section>
        </q-card>

        <q-card class="book-card">
          <q-card-section class="q-gutter-sm">
            <q-input v-model="form.name" outlined dense rounded label="Full name *" bg-color="white"
              :rules="[(v) => !!v?.trim() || 'Required']" lazy-rules />
            <q-input v-model="form.phone" outlined dense rounded label="Mobile number *" placeholder="09XX XXX XXXX" bg-color="white"
              :rules="[
                (v) => !!v?.trim() || 'Required',
                (v) => v.replace(/\D/g, '').length >= 7 || 'Enter a valid mobile number',
              ]" lazy-rules />
            <q-input v-model="form.email" outlined dense rounded label="Email (for booking updates)" type="email" bg-color="white" />
            <q-input v-model="form.notes" outlined dense rounded label="Notes for the venue (optional)" type="textarea" autogrow bg-color="white" />
            <q-btn
              unelevated rounded color="accent" icon="event_available" class="full-width q-mt-sm"
              :loading="creating" label="Reserve slots &amp; continue to payment"
              :disable="!form.name.trim() || !form.phone.trim()"
              @click="createAndPay"
            />
            <div class="text-caption text-grey-6 text-center">
              Slots are held for ~{{ holdMins }} minutes — first come, first served.
            </div>
            <div v-if="draftTenant?.refund_policy" class="refund-note q-mt-xs">
              {{ draftTenant.refund_policy }}
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

        <q-banner v-if="verifying && !reupload" dense rounded class="q-mb-md bg-blue-1 text-blue-9">
          <template #avatar><q-icon name="hourglass_top" /></template>
          Proof submitted — the venue is verifying your payment. Your slots stay held meanwhile.
        </q-banner>
        <q-banner v-else-if="holdLeft && awaitingPay" dense rounded class="q-mb-md"
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

        <q-card v-if="booking.status === 'pending_payment' && booking.payment_status !== 'paid'" class="book-card q-mb-lg">
          <q-card-section>
            <div class="book-section-label q-mb-sm">{{ verifying ? 'Payment details' : 'Pay this amount' }}</div>
            <div class="text-h4 text-weight-bold text-accent">₱{{ fmt(booking.total ?? payment?.amount) }}</div>
            <div class="text-caption text-grey-7 q-mt-xs">
              {{ booking.tenant?.name }} · {{ booking.slots?.length ?? 0 }} slot(s)
            </div>
          </q-card-section>
          <q-separator />
          <q-card-section>
            <div class="book-section-label q-mb-sm">{{ payTitle }} (proof of payment)</div>
            <template v-if="paymentMethods.length">
              <div v-for="m in paymentMethods" :key="m.id" class="pay-method">
                <div class="row items-center q-gutter-sm no-wrap">
                  <q-icon
                    :name="m.type === 'bank' ? 'account_balance' : m.type === 'cash' ? 'payments' : 'account_balance_wallet'"
                    color="accent" size="22px"
                  />
                  <div class="col">
                    <div class="text-body2 text-weight-bold">{{ m.name }}</div>
                    <div v-if="m.account_name" class="text-caption text-grey-7">{{ m.account_name }}</div>
                    <div
                      v-if="m.account_number" class="pay-acct text-caption text-weight-bold"
                      @click="copyAccount(m)"
                    >{{ m.account_number }}</div>
                  </div>
                  <q-img
                    v-if="m.qr" :src="fileUrl(m.qr)" class="pay-qr cursor-pointer" ratio="1" fit="contain"
                    spinner-color="accent" @click="qrView = { src: fileUrl(m.qr), title: `${m.name} QR` }"
                  />
                </div>
                <div v-if="m.instructions" class="text-caption text-grey-7 q-mt-xs">{{ m.instructions }}</div>
              </div>
            </template>
            <template v-else>
              <div class="gcash-box">
                <div v-if="payAccountName" class="text-body1">
                  Send to: <b>{{ payAccountName }}</b>
                </div>
                <div v-if="booking.tenant?.gcash_number" class="text-h6 text-weight-bold">
                  {{ booking.tenant.gcash_number }}
                </div>
                <div v-if="!payAccountName && !booking.tenant?.gcash_number && !booking.tenant?.bank_details" class="text-body2 text-grey-7">
                  Ask the venue for payment details
                </div>
                <q-btn
                  v-if="booking.tenant?.gcash_number" outline dense rounded color="green-8"
                  icon="content_copy" label="Copy number"
                  @click="copyGcash"
                />
              </div>
              <q-img
                v-if="booking.tenant?.payment_qr" :src="fileUrl(booking.tenant.payment_qr)"
                class="pay-qr q-mt-sm" ratio="1" fit="contain" spinner-color="accent"
              />
              <div v-if="booking.tenant?.bank_details" class="text-caption text-grey-7 q-mt-sm">
                {{ booking.tenant.bank_details }}
              </div>
            </template>
            <div v-if="booking.tenant?.refund_policy" class="refund-note q-mt-sm">
              {{ booking.tenant.refund_policy }}
            </div>
          </q-card-section>
        </q-card>

        <q-card v-if="booking.payment_status === 'pending_verification' && !reupload" class="book-card">
          <q-card-section class="text-center">
            <q-icon name="hourglass_top" color="orange" size="48px" />
            <div class="text-h6 text-weight-bold q-mt-sm">Proof submitted</div>
            <div class="text-body2 text-grey-7">The venue is verifying your payment — we'll confirm your slot shortly.</div>
            <q-btn unelevated rounded color="accent" icon="cloud_upload" label="Reupload proof"
              class="q-mt-md full-width" @click="reupload = true" />
            <q-btn flat color="accent" label="View my bookings" class="q-mt-xs"
              @click="$router.push('/book/my')" />
          </q-card-section>
        </q-card>

        <q-card v-else-if="payment && (awaitingPay || reupload)" class="book-card">
          <q-card-section>
            <div class="book-section-label q-mb-sm">Upload proof of payment</div>
            <q-banner
              v-if="holdExpired" dense rounded class="bg-red-1 text-red-9 q-mb-sm"
            >
              <template #avatar><q-icon name="error" /></template>
              Your slot hold expired — proof can no longer be submitted for this booking.
              <template #action>
                <q-btn flat dense color="red-9" label="Pick slots" @click="rebook" />
              </template>
            </q-banner>
            <div v-else class="text-caption text-grey-7 q-mb-sm">
              {{ reupload
                ? 'Upload a new receipt — the latest upload is used for verification.'
                : 'Pay via any method above, then upload the receipt — the venue verifies and confirms your slot.' }}
            </div>
            <q-input v-model="proof.refNo" outlined dense rounded label="Reference / transaction no. (optional)" class="q-mb-sm" bg-color="white" :disable="holdExpired" />
            <q-file
              v-model="proof.file" outlined dense rounded label="Receipt screenshot *"
              accept="image/*" max-file-size="5242880" bg-color="white" :disable="holdExpired"
            >
              <template #prepend><q-icon name="attach_file" /></template>
            </q-file>
            <q-btn
              unelevated rounded color="accent" icon="cloud_upload" class="full-width q-mt-md"
              :loading="submittingProof" label="Submit proof"
              :disable="holdExpired || !proof.file"
              @click="submitProofForm"
            />
          </q-card-section>
        </q-card>

        <q-card v-else-if="booking.payment_status === 'paid'" class="book-card">
          <q-card-section class="text-center">
            <q-icon name="check_circle" color="positive" size="48px" />
            <div class="text-h6 text-weight-bold q-mt-sm">Payment confirmed!</div>
            <div class="text-body2 text-grey-7">Your booking is confirmed. See you on court.</div>
            <q-btn unelevated rounded color="accent" icon="receipt_long" class="q-mt-md" label="View my bookings"
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
    <ImageLightbox v-model:open="qrOpen" :src="qrView?.src ?? ''" :title="qrView?.title" />
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
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  draftTenant, draftSlots, pendingBookingId, clearDraft,
  createBooking, ensurePayment, bookingTotal, submitProof,
  fetchBooking, fetchMyProfile, fetchVenueBundle, fetchDaySlots,
  closureBlocks, hoursFor, peso, fileUrl, tenantPayLabel, fetchPaymentMethods,
  type BookBookingDetail, type BookPayment, type BookPaymentMethod, type DraftSlot,
} from 'src/composables/useBooking';
import { useNotify } from 'src/composables/useNotify';
import ImageLightbox from 'src/components/ImageLightbox.vue';

defineOptions({ name: 'BookCheckoutPage' });
const route = useRoute();
const router = useRouter();
const { notify } = useNotify();

const booking = ref<BookBookingDetail | null>(null);
const payment = ref<BookPayment | null>(null);
const paymentMethods = ref<BookPaymentMethod[]>([]);
const qrView = ref<{ src: string; title: string } | null>(null);
const qrOpen = computed({
  get: () => qrView.value !== null,
  set: (v: boolean) => { if (!v) qrView.value = null; },
});
const loading = ref(false);
const creating = ref(false);
const submittingProof = ref(false);
const holdLeft = ref('');
const reupload = ref(false);
let holdTimer: ReturnType<typeof setInterval> | null = null;

const form = ref({ name: '', phone: '', email: '', notes: '' });
const proof = ref<{ refNo: string; file: File | null }>({ refNo: '', file: null });

const estTotal = computed(() =>
  draftSlots.value.reduce((sum, d) => {
    const m = mins(d.end) - mins(d.start);
    return sum + Number(d.pricePerHour ?? 0) * (m / 60);
  }, 0));

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

const fmt = (n: number | string | null | undefined) => peso(n, 2);
const holdMins = computed(() => draftTenant.value?.payment_timeout_minutes ?? 15);
const holdExpired = computed(() => holdLeft.value === 'expired');
const verifying = computed(() => booking.value?.payment_status === 'pending_verification');
const awaitingPay = computed(() =>
  booking.value?.status === 'pending_payment' &&
  !['pending_verification', 'paid'].includes(booking.value?.payment_status ?? ''));
const payTitle = computed(() => {
  const ms = paymentMethods.value;
  if (ms.length === 1) return `Pay via ${ms[0].name}`;
  if (ms.length > 1) return 'Payment options';
  return `Pay via ${tenantPayLabel(booking.value?.tenant ?? draftTenant.value)}`;
});
const payAccountName = computed(() => booking.value?.tenant?.gcash_name || '');
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
    if (diff <= 0) {
      holdLeft.value = 'expired';
      if (holdTimer) clearInterval(holdTimer);
      notify({
        type: 'negative', timeout: 8000,
        message: 'Your slot hold expired — please select your slots again.',
        actions: [{ label: 'Pick slots', color: 'white', handler: rebook }],
      });
      return;
    }
    const m = Math.floor(diff / 60000), s = Math.floor((diff % 60000) / 1000);
    holdLeft.value = m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m ${s}s` : `${m}m ${s}s`;
  }, 1000);
}

async function loadBooking(id: string, tenantId?: string | null) {
  // when the tenant id is already known (fresh-booking flow), overlap the
  // payment-methods fetch with the booking detail fetch instead of after it
  const methodsP = tenantId
    ? fetchPaymentMethods(tenantId).catch(() => [] as BookPaymentMethod[])
    : null;
  booking.value = await fetchBooking(id);
  if (booking.value) {
    pendingBookingId.value = id;
    const pays = booking.value.payments ?? [];
    payment.value = pays.length ? pays[pays.length - 1] : null;
    paymentMethods.value = methodsP && booking.value.tenant?.id === tenantId
      ? await methodsP
      : booking.value.tenant?.id
        ? await fetchPaymentMethods(booking.value.tenant.id).catch(() => [])
        : [];
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
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const nowM = now.getHours() * 60 + now.getMinutes();
  await Promise.all([...groups.entries()].map(async ([key, slots]) => {
    const [courtId, date] = key.split('|');
    const court = activeCourts.get(courtId);
    if (!court) { slots.forEach((s) => bad.add(s.courtName)); return; }
    const win = hoursFor(bundle.hours, courtId, dayOfWeek(date));
    const booked = await fetchDaySlots([courtId], date);
    for (const s of slots) {
      const a = mins(s.start), b = mins(s.end);
      // already past — can't book a slot that has started
      if (date < today || (date === today && a <= nowM)) { bad.add(s.courtName); continue; }
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
  if (form.value.phone.replace(/\D/g, '').length < 7) {
    notify({ type: 'negative', message: 'Please enter a valid mobile number.' });
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
    // createItem doesn't return nested slots — refetch, then check what survived.
    // bookingTotal only needs the id — overlap its poll with loadBooking.
    const totalP = bookingTotal(b.id);
    void totalP.catch(() => {}); // may go unawaited if we bail on dead slots below
    await loadBooking(b.id, draftTenant.value?.id);
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
    const total = await totalP;
    if (total > 0) {
      const pm = paymentMethods.value[0];
      payment.value = await ensurePayment(b.id, total,
        pm ? { payment_name: pm.name, payment_qr: pm.qr } : draftTenant.value);
      await loadBooking(b.id, draftTenant.value?.id); // refresh total display
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
  if (!booking.value || !payment.value || !proof.value.file) return;
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
      senderName: booking.value.customer_name,
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

async function copyAccount(m: BookPaymentMethod) {
  if (!m.account_number) return;
  try {
    await navigator.clipboard.writeText(m.account_number);
    notify({ type: 'positive', message: `${m.name} account copied` });
  } catch {
    notify({ type: 'negative', message: 'Could not copy — long-press to copy manually' });
  }
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
.pay-qr {
  max-width: 220px;
  border: 1px solid #e0e0e0;
  border-radius: 12px;
  background: #fff;
}
.pay-method {
  border: 1px solid #e8e0f5;
  border-radius: 12px;
  padding: 10px 12px;
  margin-bottom: 10px;
  background: #faf8ff;
}
.pay-method .pay-qr { max-width: 110px; max-height: 110px; }
.refund-note {
  font-size: 0.72rem;
  color: #8a6d3b;
  background: #fff8e1;
  border: 1px solid #ffecb3;
  border-radius: 8px;
  padding: 6px 10px;
}
</style>
