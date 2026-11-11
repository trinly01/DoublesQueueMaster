<template>
  <div class="hscroll">
    <div ref="track" class="hscroll-track" @scroll.passive="sync">
      <slot />
    </div>
    <q-btn
      v-show="canLeft" round unelevated dense icon="chevron_left"
      class="hscroll-arrow left" aria-label="Scroll left" @click="nudge(-1)"
    />
    <q-btn
      v-show="canRight" round unelevated dense icon="chevron_right"
      class="hscroll-arrow right" aria-label="Scroll right" @click="nudge(1)"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';

defineOptions({ name: 'HScroll' });

const track = ref<HTMLElement | null>(null);
const canLeft = ref(false);
const canRight = ref(false);
let ro: ResizeObserver | null = null;
let mo: MutationObserver | null = null;

function sync() {
  const el = track.value;
  if (!el) return;
  canLeft.value = el.scrollLeft > 4;
  canRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
}

function nudge(dir: number) {
  const el = track.value;
  if (!el) return;
  el.scrollBy({ left: dir * el.clientWidth * 0.75, behavior: 'smooth' });
}

onMounted(() => {
  sync();
  ro = new ResizeObserver(sync);
  mo = new MutationObserver(sync);
  if (track.value) {
    ro.observe(track.value);
    mo.observe(track.value, { childList: true, subtree: true });
  }
  window.addEventListener('resize', sync);
});

onBeforeUnmount(() => {
  ro?.disconnect();
  mo?.disconnect();
  window.removeEventListener('resize', sync);
});
</script>

<style lang="scss" scoped>
.hscroll { position: relative; }

.hscroll-track {
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
  &::-webkit-scrollbar { display: none; }
}

.hscroll-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 2;
  background: rgba(255, 255, 255, 0.95);
  color: #764ba2;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.22);

  &.left { left: 2px; }
  &.right { right: 2px; }
}
</style>
