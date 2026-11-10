<template>
  <q-page class="book-page">
    <div class="book-container">
      <q-inner-loading :showing="loading" />

      <template v-if="bundle">
        <div class="book-header">
          <q-btn flat dense round icon="arrow_back" @click="$router.back()" />
          <div class="col">
            <div class="book-title ellipsis">{{ bundle.tenant.name }}</div>
            <div class="book-subtitle ellipsis">{{ bundle.tenant.address }}</div>
          </div>
        </div>

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
            <div class="book-section-label q-mb-xs">Pay via GCash (proof of payment)</div>
            <div class="row items-baseline q-gutter-x-sm">
              <span v-if="bundle.tenant.gcash_name" class="text-body2 text-weight-bold">{{ bundle.tenant.gcash_name }}</span>
              <span v-if="bundle.tenant.gcash_number" class="text-subtitle1 text-weight-bold text-accent">{{ bundle.tenant.gcash_number }}</span>
              <span v-if="!bundle.tenant.gcash_name && !bundle.tenant.gcash_number" class="text-body2 text-grey-6">Ask the venue for payment details</span>
            </div>
            <div v-if="bundle.tenant.bank_details" class="text-caption text-grey-7 q-mt-xs">
              {{ bundle.tenant.bank_details }}
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
            <q-img
              v-if="c.photo" :src="fileUrl(c.photo)" class="court-photo"
              ratio="1" spinner-color="accent"
            />
            <div v-else class="court-photo court-photo-empty flex flex-center">
              <q-icon name="sports_tennis" size="28px" color="grey-4" />
            </div>
            <div class="col">
              <div class="text-subtitle2 text-weight-bold">{{ c.name }}</div>
              <div class="text-caption text-grey-7">
                {{ [c.sport_name, c.surface].filter(Boolean).join(' · ') || 'Court' }}
              </div>
              <div class="text-subtitle2 text-weight-bold text-accent q-mt-xs">
                ₱{{ fmt(c.price_per_hour) }}<span class="text-caption text-grey-7">/hr</span>
              </div>
            </div>
            <q-btn
              unelevated rounded color="accent" label="Book"
              @click="$router.push(`/book/v/${bundle.tenant.slug}/book?court=${c.id}`)"
            />
          </q-card-section>
        </q-card>
      </template>

      <div v-else-if="!loading" class="book-empty">
        <q-icon name="error_outline" size="56px" color="grey-4" class="q-mb-sm" />
        <div class="text-subtitle1 text-weight-medium">Venue not found or not taking bookings</div>
        <q-btn flat color="accent" label="Back to venues" class="q-mt-sm" @click="$router.push('/book')" />
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { fetchVenueBundle, fileUrl, toHM, peso } from 'src/composables/useBooking';

defineOptions({ name: 'BookVenuePage' });
const route = useRoute();

const bundle = ref<Awaited<ReturnType<typeof fetchVenueBundle>>>(null);
const loading = ref(true);

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
.court-photo { width: 72px; height: 72px; border-radius: 10px; }
.court-photo-empty { background: #f5f5f5; border: 1px dashed #d0d0d0; }
</style>
