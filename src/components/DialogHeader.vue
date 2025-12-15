<template>
  <q-card-section class="dialog-header q-pa-none">
    <q-toolbar class="q-pa-md">
      <q-toolbar-title>
        <q-icon v-if="icon" :name="icon" class="q-mr-sm" />
        {{ title }}
      </q-toolbar-title>
      <q-btn icon="close" flat round dense v-close-popup />
    </q-toolbar>
  </q-card-section>
</template>

<script setup lang="ts">
interface Props {
  title: string;
  icon?: string;
}

defineProps<Props>();
</script>

<style lang="scss" scoped>
.dialog-header {
  min-height: 60px !important;
}

/* Dynamic gradient classes */
.players-header {
  background: linear-gradient(135deg, #667eea 0%, #5a67d8 100%) !important;
  color: white;
}

.queue-header {
  background: linear-gradient(135deg, #764ba2 0%, #9f7aea 100%) !important;
  color: white;
}

.matches-header {
  background: linear-gradient(135deg, #5a67d8 0%, #667eea 100%) !important;
  color: white;
}

.settings-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
  color: white;
}
</style>
