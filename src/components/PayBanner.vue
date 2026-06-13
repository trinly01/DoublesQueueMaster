<template>
  <div class="row items-center justify-between q-mb-sm q-pa-sm rounded-borders bg-amber-1">
    <span class="text-caption text-amber-10 text-weight-medium">
      {{ message }}
    </span>
    <q-btn
      color="accent"
      label="Pay"
      icon="payment"
      size="sm"
      dense
      :loading="loading"
      @click="emit('pay')"
    />
  </div>
</template>

<script setup lang="ts">
interface Props {
  message?: string;
  loading?: boolean;
}

withDefaults(defineProps<Props>(), {
  message: 'Subscription expired. Renew to view player details.',
  loading: false,
});

const emit = defineEmits<{
  pay: [];
}>();
</script>
