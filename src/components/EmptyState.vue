<template>
  <div class="empty-state">
    <q-icon :name="icon" :size="iconSize" :color="iconColor" />
    <p class="text-grey-6 q-mt-sm">{{ title }}</p>
    <p v-if="subtitle" class="text-caption text-grey-5">{{ subtitle }}</p>
    <div v-if="$slots.action" class="q-mt-md">
      <slot name="action" />
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  icon: string;
  title: string;
  subtitle?: string;
  iconSize?: string;
  iconColor?: string;
}

withDefaults(defineProps<Props>(), {
  iconSize: '48px',
  iconColor: 'grey-4'
});
</script>

<style lang="scss" scoped>
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  text-align: center;
}
</style>
