<template>
  <!-- Masked with image: generic placeholder, never reveals real identity -->
  <q-avatar v-if="masked && imageUrl" :size="size">
    <img :src="genericAvatarUrl" alt="Player" />
  </q-avatar>

  <!-- No image (or masked without image): colored initials -->
  <q-avatar
    v-else-if="!imageUrl"
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

  <!-- Real image -->
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
  masked?: boolean;
  index?: number;
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md',
  textColor: 'white',
  masked: false,
});

defineEmits<{
  imageError: [];
}>();

// Compute initials from name > username > email
const initials = computed(() => {
  if (props.masked) return '*';
  const source =
    props.name || props.username || props.email?.split('@')[0] || '';
  return source.charAt(0).toUpperCase();
});

const genericAvatarUrl = computed(() => {
  const n = (props.index ?? 0) % 6;
  return `https://cdn.quasar.dev/img/avatar${n + 1}.jpg`;
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
