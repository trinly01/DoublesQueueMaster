<template>
  <img
    :src="duprLogo"
    :width="size"
    :height="size"
    alt="DUPR"
    class="dupr-logo"
  />
</template>

<script setup lang="ts">
import duprLogo from 'src/assets/dupr-logo.png';

withDefaults(
  defineProps<{
    size?: number;
  }>(),
  {
    size: 16,
  },
);
</script>

<style scoped>
.dupr-logo {
  display: inline-block;
  vertical-align: middle;
  object-fit: contain;
}
</style>
