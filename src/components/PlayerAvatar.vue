<template>
  <q-avatar
    v-if="!imageUrl"
    :color="effectiveColor"
    :text-color="textColor || 'white'"
    :size="size"
  >
    {{ initials }}
    <q-badge
      v-if="showStatusBadge"
      floating
      rounded
      :color="statusBadgeColor"
      style="padding: 2px; min-height: 14px; min-width: 14px"
    >
      <q-icon name="verified" size="12px" />
      <q-tooltip anchor="top middle" self="bottom middle" :offset="[8, 8]">{{
        statusTooltip
      }}</q-tooltip>
    </q-badge>
  </q-avatar>

  <q-avatar v-else :size="size">
    <img
      :src="imageUrl"
      :alt="name || username || 'Player'"
      @error="$emit('imageError')"
    />
    <q-badge
      v-if="showStatusBadge"
      floating
      rounded
      :color="statusBadgeColor"
      style="
        padding: 2px;
        min-height: 14px;
        min-width: 14px;
        bottom: -6px;
        left: -2px;
        top: auto;
        right: auto;
      "
    >
      <q-icon name="verified" size="12px" />
      <q-tooltip anchor="top middle" self="bottom middle" :offset="[8, 8]">{{
        statusTooltip
      }}</q-tooltip>
    </q-badge>
  </q-avatar>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  name?: string;
  username?: string;
  email?: string;
  level?: 1 | 2 | 3;
  userId?: string;
  duprId?: string;
  imageUrl?: string;
  size?: string;
  color?: string;
  textColor?: string;
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md',
  textColor: 'white',
});

defineEmits<{
  imageError: [];
}>();

// Compute initials from name > username > email
const initials = computed(() => {
  const source =
    props.name || props.username || props.email?.split('@')[0] || '';
  return source.charAt(0).toUpperCase();
});

// Color fallback: prop > grey
const effectiveColor = computed(() => {
  if (props.color) return props.color;
  if (props.level === 1) return 'green-6';
  if (props.level === 2) return 'orange-7';
  if (props.level === 3) return 'red-8';
  return 'grey-5';
});

const showStatusBadge = computed(() => !!props.userId || !!props.duprId);

const statusBadgeColor = computed(() => (props.duprId ? 'blue-6' : 'accent'));

const statusTooltip = computed(() =>
  props.duprId ? 'DUPR linked' : 'Registered member',
);
</script>
