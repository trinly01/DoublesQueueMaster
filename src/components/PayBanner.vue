<template>
  <div class="row items-center q-mb-sm q-pa-sm rounded-borders bg-amber-1">
    <div class="col-12 col-sm pay-banner-msg">
      <span class="text-caption text-amber-10 text-weight-medium">
        {{ message }}
      </span>
    </div>
    <div class="col-12 col-sm-auto pay-banner-btn q-mt-xs q-mt-sm-none">
      <q-btn
        color="accent"
        :label="buttonLabel"
        icon="payment"
        size="sm"
        :loading="loading"
        @click="emit('pay')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  message?: string;
  buttonLabel?: string;
  loading?: boolean;
}

withDefaults(defineProps<Props>(), {
  message: 'These are Pro features.',
  buttonLabel: 'Reactivate',
  loading: false,
});

const emit = defineEmits<{
  pay: [];
}>();
</script>

<style lang="scss" scoped>
.pay-banner-msg {
  text-align: center;
}
.pay-banner-btn {
  text-align: center;
}

@media (min-width: 600px) {
  .pay-banner-msg {
    text-align: left;
  }
  .pay-banner-btn {
    text-align: right;
  }
}
</style>
