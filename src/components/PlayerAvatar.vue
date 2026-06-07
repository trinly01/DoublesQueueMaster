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
      <q-tooltip>{{ statusTooltip }}</q-tooltip>
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
      <q-tooltip>{{ statusTooltip }}</q-tooltip>
    </q-badge>
    <q-badge
      v-if="showLevelBadge && level"
      floating
      rounded
      :color="levelColor"
      style="
        padding: 2px;
        min-height: 8px;
        min-width: 8px;
        bottom: -2px;
        right: -2px;
        top: auto;
        left: auto;
      "
    >
      <q-tooltip>Level {{ level }}</q-tooltip>
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
  showLevelBadge?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md',
  textColor: 'white',
  showLevelBadge: true,
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

const levelColor = computed(() => {
  if (props.level === 1) return 'green-6';
  if (props.level === 2) return 'orange-7';
  if (props.level === 3) return 'red-8';
  return 'grey-5';
});

// Color fallback: level > prop > grey
const effectiveColor = computed(() => {
  if (props.color) return props.color;
  if (props.level === 1) return 'green-6';
  if (props.level === 2) return 'orange-7';
  if (props.level === 3) return 'red-8';
  return 'grey-5';
});

const showStatusBadge = computed(() => !!props.userId);

const statusBadgeColor = computed(() => (props.duprId ? 'blue-6' : 'accent'));

const statusTooltip = computed(() =>
  props.duprId ? 'Registered • DUPR linked' : 'Registered member',
);
</script>
