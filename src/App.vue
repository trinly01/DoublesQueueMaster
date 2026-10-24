<template>
  <router-view />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useSessionGuard } from 'src/composables/useSessionGuard';

defineOptions({
  name: 'App',
});

const { startSessionGuard, stopSessionGuard } = useSessionGuard();

onMounted(() => {
  startSessionGuard();
});

onUnmounted(() => {
  stopSessionGuard();
});
</script>
