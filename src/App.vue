<template>
  <router-view />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useSessionGuard } from 'src/composables/useSessionGuard';

defineOptions({
  name: 'App',
});

const router = useRouter();
const { startSessionGuard, stopSessionGuard } = useSessionGuard();

onMounted(() => {
  startSessionGuard(router);
});

onUnmounted(() => {
  stopSessionGuard();
});
</script>
