<template>
  <q-page class="book-page">
    <div class="book-container">
      <q-inner-loading :showing="loading" />

      <template v-if="bundle">
        <div class="book-header">
          <q-btn flat dense round icon="arrow_back" @click="$router.push('/book')" />
        <q-btn flat dense round icon="home" :to="'/'" />
          <div class="col">
            <div class="book-title ellipsis">{{ bundle.tenant.name }}</div>
            <div class="book-subtitle ellipsis">{{ bundle.tenant.address }}</div>
          </div>
        </div>

        <!-- suspended/pending venue: exists but not taking bookings -->
        <q-card v-if="venueUnavailable" class="book-card q-mb-md">
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
        <!-- venue hero -->
        <q-card class="book-card venue-hero q-mb-md">
          <q-card-section class="row q-col-gutter-md items-center q-pa-lg">
            <div class="book-logo venue-logo-lg">
              <img v-if="bundle.tenant.logo" :src="fileUrl(bundle.tenant.logo)" alt="" />
              <q-icon v-else name="sports_tennis" size="40px" color="accent" class="full-height flex flex-center" />
            </div>
            <div class="col">
              <div v-if="bundle.tenant.description" class="text-body2 q-mb-xs">
                {{ bundle.tenant.description }}
              </div>
              <div class="row q-gutter-x-md q-gutter-y-xs text-caption text-grey-8">
                <span v-if="bundle.tenant.contact_phone" class="row items-center">
                  <q-icon name="call" size="14px" class="q-mr-xs" />{{ bundle.tenant.contact_phone }}
                </span>
                <span v-if="bundle.tenant.contact_email" class="row items-center">
                  <q-icon name="mail" size="14px" class="q-mr-xs" />{{ bundle.tenant.contact_email }}
                </span>
                <a
                  v-if="bundle.tenant.latitude && bundle.tenant.longitude"
                  class="row items-center text-accent" style="text-decoration:none"
                  :href="`https://maps.google.com/?q=${bundle.tenant.latitude},${bundle.tenant.longitude}`"
                  target="_blank" rel="noopener"
                >
                  <q-icon name="place" size="14px" class="q-mr-xs" />Directions
                </a>
              </div>
            </div>
          </q-card-section>
          <q-separator />
          <q-card-section>
            <div class="book-section-label q-mb-xs">{{ payTitle }} (proof of payment)</div>
            <template v-if="bundle.paymentMethods.length">
              <div v-for="m in bundle.paymentMethods" :key="m.id" class="pay-method">
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
              <div class="row items-baseline q-gutter-x-sm">
                <span v-if="bundle.tenant.gcash_name" class="text-body2 text-weight-bold">{{ bundle.tenant.gcash_name }}</span>
                <span v-if="bundle.tenant.gcash_number" class="text-subtitle1 text-weight-bold text-accent">{{ bundle.tenant.gcash_number }}</span>
                <span v-if="!bundle.tenant.gcash_name && !bundle.tenant.gcash_number && !bundle.tenant.bank_details && !bundle.tenant.payment_qr" class="text-body2 text-grey-6">Ask the venue for payment details</span>
              </div>
              <q-img
                v-if="bundle.tenant.payment_qr" :src="fileUrl(bundle.tenant.payment_qr)"
                class="pay-qr q-mt-sm" ratio="1" fit="contain" spinner-color="accent"
              />
              <div v-if="bundle.tenant.bank_details" class="text-caption text-grey-7 q-mt-xs">
                {{ bundle.tenant.bank_details }}
              </div>
            </template>
            <div v-if="bundle.tenant.refund_policy" class="refund-note q-mt-sm">
              {{ bundle.tenant.refund_policy }}
            </div>
          </q-card-section>
        </q-card>

        <!-- hours -->
        <q-card class="book-card q-mb-md">
          <q-card-section>
            <div class="book-section-label q-mb-sm">Opening hours</div>
            <template v-if="weeklyHours.length">
              <div v-for="d in weeklyHours" :key="d.label" class="row justify-between text-body2 q-py-xs">
                <span class="text-weight-medium" style="width:90px">{{ d.label }}</span>
                <span :class="d.closed ? 'text-grey-5' : ''">{{ d.text }}</span>
              </div>
            </template>
            <div v-else class="text-body2 text-grey-6">
              Hours not published — the calendar shows the bookable window for each day.
            </div>
          </q-card-section>
        </q-card>

        <!-- courts -->
        <div class="book-section-label q-mb-sm q-mt-md">Courts</div>
        <div v-if="!bundle.courts.length" class="text-grey-6 q-pa-md">
          No courts available for booking right now.
        </div>
        <q-card
          v-for="c in bundle.courts" :key="c.id"
          class="book-card court-card q-mb-sm"
        >
          <q-card-section class="row items-center q-col-gutter-sm q-pa-md">
            <div class="court-photo-wrap cursor-pointer" @click="photoCourt = c">
              <q-img
                v-if="c.photo" :src="fileUrl(c.photo)" class="court-photo"
                ratio="1" spinner-color="accent"
              />
              <div v-else class="court-photo court-photo-empty flex flex-center">
                <q-icon name="sports_tennis" size="28px" color="grey-4" />
              </div>
              <q-icon v-if="c.photo" name="zoom_in" size="14px" class="court-photo-zoom" />
            </div>
            <div class="col">
              <div class="text-subtitle2 text-weight-bold">{{ c.name }}</div>
              <div class="text-caption text-grey-7">
                {{ [c.sport_name, c.surface].filter(Boolean).join(' · ') || 'Court' }}
              </div>
              <div v-if="c.description" class="text-caption text-grey-7 court-desc q-mt-xs">
                {{ c.description }}
              </div>
              <div class="text-subtitle2 text-weight-bold text-accent q-mt-xs">
                ₱{{ fmt(c.price_per_hour) }}<span class="text-caption text-grey-7">/hr</span>
              </div>
            </div>
            <q-btn
              unelevated rounded color="accent" icon="event_available"
              label="Book" size="sm"
              @click="$router.push(`/book/v/${bundle.tenant.slug}/book?court=${c.id}`)"
            />
          </q-card-section>
        </q-card>
        </template>
      </template>

      <div v-else-if="!loading" class="book-empty">
        <q-icon name="error_outline" size="56px" color="grey-4" class="q-mb-sm" />
        <div class="text-subtitle1 text-weight-medium">Venue not found or not taking bookings</div>
        <q-btn flat color="accent" label="Back to venues" class="q-mt-sm" @click="$router.push('/book')" />
      </div>
    </div>
    <CourtPhotoDialog v-model:court="photoCourt" />
    <ImageLightbox v-model:open="qrOpen" :src="qrView?.src ?? ''" :title="qrView?.title" />
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { fetchVenueBundle, fileUrl, toHM, peso, tenantPayLabel, type BookCourt, type BookPaymentMethod } from 'src/composables/useBooking';
import CourtPhotoDialog from 'src/components/CourtPhotoDialog.vue';
import ImageLightbox from 'src/components/ImageLightbox.vue';
import { useNotify } from 'src/composables/useNotify';

defineOptions({ name: 'BookVenuePage' });
const route = useRoute();

const bundle = ref<Awaited<ReturnType<typeof fetchVenueBundle>>>(null);
const venueUnavailable = computed(() => bundle.value != null && bundle.value.tenant.status !== 'active');
const loading = ref(true);
const photoCourt = ref<BookCourt | null>(null);
const qrView = ref<{ src: string; title: string } | null>(null);
const qrOpen = computed({
  get: () => qrView.value !== null,
  set: (v: boolean) => { if (!v) qrView.value = null; },
});
const payTitle = computed(() => {
  const ms = bundle.value?.paymentMethods ?? [];
  if (ms.length === 1) return `Pay via ${ms[0].name}`;
  if (ms.length > 1) return 'Payment options';
  return `Pay via ${tenantPayLabel(bundle.value?.tenant)}`;
});

const { notify } = useNotify();
async function copyAccount(m: BookPaymentMethod) {
  if (!m.account_number) return;
  try {
    await navigator.clipboard.writeText(m.account_number);
    notify({ type: 'positive', message: `${m.name} account copied` });
  } catch {
    notify({ type: 'negative', message: 'Could not copy — long-press to copy manually' });
  }
}

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const weeklyHours = computed(() => {
  if (!bundle.value) return [];
  const hours = bundle.value.hours.filter((h) => h.court == null);
  if (!hours.length) return [];
  return DAY_LABELS.map((label, i) => {
    const h = hours.find((x) => x.day_of_week === i);
    return {
      label,
      closed: !h || h.closed,
      text: !h || h.closed ? 'Closed' : `${toHM(hm(h.open_time))} – ${toHM(hm(h.close_time))}`,
    };
  });
});

const hm = (t: string) => { const [h, m] = t.split(':'); return parseInt(h, 10) * 60 + parseInt(m, 10); };
const fmt = (n: number | string | null | undefined) => peso(n);

onMounted(async () => {
  try {
    bundle.value = await fetchVenueBundle(String(route.params.slug));
  } catch (e) {
    console.error('venue load failed', e);
  } finally {
    loading.value = false;
  }
});
</script>

<style lang="scss" scoped>
.venue-logo-lg { width: 88px; height: 88px; flex-shrink: 0; }
.court-photo-wrap { position: relative; flex-shrink: 0; }
.court-photo { width: 96px; height: 96px; border-radius: 10px; }
.court-photo-zoom {
  position: absolute; right: -4px; bottom: -4px;
  background: rgba(255, 255, 255, 0.92); color: #764ba2;
  border-radius: 50%; padding: 3px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
}
.court-desc { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.court-photo-empty { background: #f5f5f5; border: 1px dashed #d0d0d0; }
.refund-note {
  font-size: 0.72rem;
  color: #8a6d3b;
  background: #fff8e1;
  border: 1px solid #ffecb3;
  border-radius: 8px;
  padding: 6px 10px;
  white-space: pre-line;
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
</style>
