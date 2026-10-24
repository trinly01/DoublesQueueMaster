<template>
  <router-view />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useSessionGuard } from 'src/composables/useSessionGuard';
import { warmInsights } from 'src/composables/useInsights';

defineOptions({
  name: 'App',
});

const { startSessionGuard, stopSessionGuard } = useSessionGuard();

onMounted(() => {
  startSessionGuard();
  // Returning insight users get the model pre-loaded in the background so
  // the card opens warm instead of spending ~10s on engine init.
  const idle = window.requestIdleCallback ?? ((cb) => setTimeout(cb, 5000));
  idle(() => warmInsights());
});

onUnmounted(() => {
  stopSessionGuard();
});
</script>
