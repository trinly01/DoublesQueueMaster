<template>
  <div
    v-if="
      stats &&
      ((stats.total ?? 0) > 0 ||
        (stats.cancelled ?? 0) > 0 ||
        (stats.scored ?? 0) > 0)
    "
    class="row q-gutter-xs q-mt-xs"
  >
    <q-chip
      v-if="(stats.total ?? 0) > 0"
      :label="stats.total"
      color="accent"
      text-color="white"
      size="xs"
      dense
      icon="sports_tennis"
    >
      <q-tooltip anchor="top middle" self="bottom middle">Total</q-tooltip>
    </q-chip>
    <q-chip
      v-if="stats.auto > 0"
      :label="stats.auto"
      color="green-2"
      text-color="green-9"
      size="xs"
      dense
      icon="auto_awesome"
    >
      <q-tooltip anchor="top middle" self="bottom middle">Auto</q-tooltip>
    </q-chip>
    <q-chip
      v-if="stats.manual > 0"
      :label="stats.manual"
      color="orange-2"
      text-color="orange-9"
      size="xs"
      dense
      icon="pan_tool"
    >
      <q-tooltip anchor="top middle" self="bottom middle">Manual</q-tooltip>
    </q-chip>
    <q-chip
      v-if="stats.edited > 0"
      :label="stats.edited"
      color="amber-3"
      text-color="amber-10"
      size="xs"
      dense
      icon="edit"
    >
      <q-tooltip anchor="top middle" self="bottom middle">Edited</q-tooltip>
    </q-chip>
    <q-chip
      v-if="(stats.scored ?? 0) > 0"
      :label="stats.scored"
      color="green-2"
      text-color="green-9"
      size="xs"
      dense
      icon="check_circle"
    >
      <q-tooltip anchor="top middle" self="bottom middle">Scored</q-tooltip>
    </q-chip>
    <q-chip
      v-if="stats.cancelled > 0"
      :label="stats.cancelled"
      color="red-2"
      text-color="red-9"
      size="xs"
      dense
      icon="cancel"
    >
      <q-tooltip anchor="top middle" self="bottom middle">Cancelled</q-tooltip>
    </q-chip>
  </div>
</template>

<script setup lang="ts">
interface MatchStats {
  total: number;
  auto: number;
  manual: number;
  edited: number;
  scored: number;
  cancelled: number;
}

defineProps<{
  stats?: MatchStats | null;
}>();
</script>
