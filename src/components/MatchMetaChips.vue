<template>
  <div
    v-if="meta && (meta.generationType || meta.generatedBy)"
    class="row justify-center q-gutter-xs q-mt-xs"
  >
    <q-chip
      v-if="meta.isEdited"
      color="amber-3"
      text-color="amber-10"
      size="xs"
      dense
      icon="edit"
    >
      Edited
    </q-chip>
    <q-chip
      v-else-if="meta.generationType === 'auto'"
      color="green-2"
      text-color="green-9"
      size="xs"
      dense
      icon="auto_awesome"
    >
      Auto
    </q-chip>
    <q-chip
      v-else-if="meta.generationType === 'manual'"
      color="orange-2"
      text-color="orange-9"
      size="xs"
      dense
      icon="pan_tool"
    >
      Manual
    </q-chip>
    <q-chip
      v-if="
        meta.generationType === 'auto' && !meta.isEdited && meta.matchmakingMode
      "
      color="blue-grey-2"
      text-color="blue-grey-9"
      size="xs"
      dense
      icon="balance"
    >
      {{ modeLabel(meta.matchmakingMode) }}
    </q-chip>
    <q-chip
      v-if="meta.generatedBy"
      color="grey-3"
      text-color="grey-9"
      size="xs"
      dense
      icon="person"
    >
      {{ meta.generatedBy }}
    </q-chip>
  </div>
</template>

<script setup lang="ts">
interface MatchMeta {
  generatedBy?: string;
  matchmakingMode?: string;
  generationType?: 'auto' | 'manual';
  isEdited?: boolean;
}

defineProps<{
  meta?: MatchMeta;
}>();

const modeLabel = (mode: string): string => {
  const labels: Record<string, string> = {
    fair_balance: 'Casual',
    variety_first: 'Social',
    balance_first: 'Competitive',
    balanced_variety: 'Standard',
    strict_balance: 'All-Star',
  };
  return labels[mode] || mode;
};
</script>
