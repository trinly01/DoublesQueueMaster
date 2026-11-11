<template>
  <q-page class="book-page">
    <div class="book-container">
      <div class="book-header">
        <q-btn flat dense round icon="home" :to="'/'" />
        <div class="col">
          <div class="book-title">Book a Court</div>
          <div class="book-subtitle">Pick a venue near you</div>
        </div>
        <q-btn
          unelevated rounded color="accent" icon="event_note" label="My bookings"
          dense size="sm" class="q-px-sm" :to="'/book/my'"
        />
      </div>

      <div class="book-search-wrap q-mb-sm">
        <q-icon name="search" class="book-search-icon" />
        <input
          v-model="search"
          class="book-search-input"
          type="search"
          placeholder="Search venues by name or area…"
          aria-label="Search venues"
        />
        <q-btn v-if="search" flat dense round icon="close" size="sm" color="grey-6"
          aria-label="Clear search" @click="search = ''" />
      </div>
      <div v-if="search.trim()" class="text-caption text-grey-7 q-mb-md">
        {{ filtered.length }} venue{{ filtered.length === 1 ? '' : 's' }} found
        for “{{ search.trim() }}”
      </div>
      <div v-else class="q-mb-md" />

      <q-inner-loading :showing="loading" />

      <div v-if="!loading && !venues.length" class="book-empty">
        <q-icon name="sports_tennis" size="56px" color="grey-4" class="q-mb-sm" />
        <div class="text-subtitle1 text-weight-medium">No venues available right now</div>
        <div class="text-caption q-mt-xs">Check back soon — new venues are joining.</div>
      </div>
      <div v-else-if="!loading && !filtered.length" class="book-empty">
        <q-icon name="search_off" size="56px" color="grey-4" class="q-mb-sm" />
        <div class="text-subtitle1 text-weight-medium">
          No venues match “{{ search.trim() }}”
        </div>
        <q-btn flat dense color="accent" label="Clear search" class="q-mt-sm"
          @click="search = ''" />
      </div>

      <div class="venue-list">
        <q-card
          v-for="v in filtered" :key="v.id"
          class="book-card venue-card q-mb-sm cursor-pointer"
          @click="$router.push(`/book/v/${v.slug}/book`)"
        >
          <q-card-section class="row items-center q-col-gutter-sm q-pa-md">
            <div class="book-logo venue-logo">
              <img v-if="v.logo" :src="fileUrl(v.logo)" alt="" />
              <q-icon v-else name="sports_tennis" size="30px" color="accent" class="full-height flex flex-center" />
            </div>
            <div class="col">
              <div class="text-subtitle1 text-weight-bold">{{ v.name }}</div>
              <div class="text-caption text-grey-7 ellipsis">{{ v.address || v.description || 'Sports venue' }}</div>
              <div class="row items-center q-gutter-xs q-mt-xs">
                <q-chip dense unelevated color="purple-1" text-color="purple-9" icon="stadium" size="sm">
                  {{ v.court_count }} court{{ v.court_count === 1 ? '' : 's' }}
                  <template v-if="v.min_price != null"> · from ₱{{ peso(v.min_price) }}/hr</template>
                </q-chip>
                <q-chip dense unelevated color="green-1" text-color="green-9" icon="payments" size="sm">
                  GCash
                </q-chip>
              </div>
            </div>
            <div class="column items-end q-gutter-xs">
              <q-icon name="chevron_right" color="accent" size="28px" />
              <q-btn
                flat dense no-caps color="grey-7" size="sm" label="Details"
                @click.stop="$router.push(`/book/v/${v.slug}`)"
              />
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { fetchVenues, fileUrl, peso, type VenueCard } from 'src/composables/useBooking';

defineOptions({ name: 'BookVenuesPage' });

const venues = ref<VenueCard[]>([]);
const loading = ref(true);
const search = ref('');

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return venues.value;
  return venues.value.filter((v) =>
    v.name.toLowerCase().includes(q) ||
    (v.address ?? '').toLowerCase().includes(q) ||
    (v.description ?? '').toLowerCase().includes(q));
});

onMounted(async () => {
  try {
    venues.value = await fetchVenues();
  } catch (e) {
    console.error('fetch venues failed', e);
  } finally {
    loading.value = false;
  }
});
</script>

<style lang="scss" scoped>
.venue-logo { width: 64px; height: 64px; flex-shrink: 0; }
</style>
