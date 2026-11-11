<template>
  <q-dialog
    :model-value="court != null"
    @update:model-value="(v: boolean) => { if (!v) $emit('update:court', null); }"
  >
    <q-card v-if="court" class="court-photo-dialog" flat bordered>
      <q-carousel
        v-if="slides.length > 1"
        v-model="slide" swipeable animated arrows navigation
        class="dialog-photo"
      >
        <q-carousel-slide v-for="(s, i) in slides" :key="i" :name="i" class="row items-center justify-center">
          <q-img :src="s.src" fit="contain" class="dialog-slide-img" spinner-color="accent" />
          <div v-if="s.caption" class="absolute-bottom text-center text-caption q-pa-xs slide-caption">
            {{ s.caption }}
          </div>
        </q-carousel-slide>
      </q-carousel>
      <q-img
        v-else-if="slides.length" :src="slides[0].src"
        class="dialog-photo" fit="contain" spinner-color="accent"
      />
      <div v-else class="dialog-photo dialog-photo-empty flex flex-center">
        <q-icon name="sports_tennis" size="72px" color="grey-4" />
      </div>
      <q-card-section>
        <div class="row items-start justify-between q-col-gutter-sm">
          <div class="col">
            <div class="text-subtitle1 text-weight-bold">{{ court.name }}</div>
            <div class="text-caption text-grey-7">
              {{ [court.sport_name, court.surface].filter(Boolean).join(' · ') || 'Court' }}
            </div>
            <div v-if="court.description" class="text-body2 text-grey-8 q-mt-sm court-dialog-desc">
              {{ court.description }}
            </div>
          </div>
          <div class="text-right">
            <div class="text-h6 text-weight-bold text-accent">
              ₱{{ fmt(court.price_per_hour) }}<span class="text-caption text-grey-7">/hr</span>
            </div>
            <q-btn flat round dense icon="close" color="grey-6" @click="$emit('update:court', null)" />
          </div>
        </div>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { fileUrl, peso, type BookCourt } from 'src/composables/useBooking';

defineOptions({ name: 'CourtPhotoDialog' });

const props = defineProps<{ court: BookCourt | null }>();
defineEmits<{ 'update:court': [BookCourt | null] }>();

const slide = ref(0);
watch(() => props.court, () => { slide.value = 0; });

// cover photo first, then gallery rows (dedup by file id, sort/caption preserved)
const slides = computed(() => {
  const c = props.court;
  if (!c) return [] as { src: string; caption: string | null }[];
  const out: { src: string; caption: string | null }[] = [];
  const seen = new Set<string>();
  if (c.photo) { out.push({ src: fileUrl(c.photo), caption: null }); seen.add(c.photo); }
  for (const p of c.photos ?? []) {
    if (p.photo && !seen.has(p.photo)) {
      out.push({ src: fileUrl(p.photo), caption: p.caption });
      seen.add(p.photo);
    }
  }
  return out;
});

const fmt = (v: number | null | undefined) => peso(v);
</script>

<style lang="scss" scoped>
.court-photo-dialog {
  width: min(560px, 92vw);
  max-width: 100%;
  border-radius: 16px;
  overflow: hidden;
}
.dialog-photo {
  width: 100%;
  height: 320px;
  background: #f3f0f9;
}
.dialog-slide-img { max-height: 100%; max-width: 100%; }
.slide-caption {
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  border-radius: 6px;
}
.dialog-photo-empty { background: #f5f5f5; }
.court-dialog-desc { white-space: pre-line; }
</style>
