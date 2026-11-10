<template>
  <q-page class="book-page">
    <div class="book-container">
      <div class="book-header">
        <q-btn flat dense round icon="arrow_back" @click="$router.back()" />
        <div class="col">
          <div class="book-title">Book a Court</div>
          <div class="book-subtitle">Pick a venue near you</div>
        </div>
      </div>

      <q-input
        v-model="search"
        outlined dense rounded class="q-mb-md book-search"
        placeholder="Search venues…"
        clearable bg-color="white"
      >
        <template #prepend><q-icon name="search" color="accent" /></template>
      </q-input>

      <q-inner-loading :showing="loading" />

      <div v-if="!loading && !filtered.length" class="book-empty">
        <q-icon name="sports_tennis" size="56px" color="grey-4" class="q-mb-sm" />
        <div class="text-subtitle1 text-weight-medium">No venues available right now</div>
        <div class="text-caption q-mt-xs">Check back soon — new venues are joining.</div>
      </div>

      <div class="venue-list">
        <q-card
          v-for="v in filtered" :key="v.id"
          class="book-card venue-card q-mb-sm cursor-pointer"
          @click="$router.push(`/book/v/${v.slug}`)"
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
            <q-icon name="chevron_right" color="accent" size="28px" />
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
    v.name.toLowerCase().includes(q) || (v.address ?? '').toLowerCase().includes(q));
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
.book-search { max-width: 520px; }
.venue-logo { width: 64px; height: 64px; flex-shrink: 0; }
</style>
