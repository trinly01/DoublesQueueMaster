<template>
  <q-dialog :model-value="open" @update:model-value="(v) => emit('update:open', v)">
    <q-card class="image-lightbox">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-subtitle2 text-weight-bold ellipsis">{{ title }}</div>
        <q-space />
        <q-btn flat round dense icon="close" @click="emit('update:open', false)" />
      </q-card-section>
      <q-card-section class="q-pt-sm">
        <img :src="src" class="lightbox-img" :alt="title" />
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
defineOptions({ name: 'ImageLightbox' });
defineProps<{ src: string; title?: string; open: boolean }>();
const emit = defineEmits<{ (e: 'update:open', v: boolean): void }>();
</script>

<style scoped>
.image-lightbox { width: min(680px, 94vw); }
.lightbox-img { display: block; max-width: 100%; max-height: 72vh; margin: 0 auto; }
</style>
