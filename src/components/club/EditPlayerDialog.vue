<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :maximized="$q.screen.lt.md"
  >
    <q-card
      class="bg-white"
      style="
        max-width: 800px;
        width: 95vw;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
      "
    >
      <!-- Header -->
      <DialogHeader title="Edit Player" icon="edit" />

      <!-- Content -->
      <q-card-section class="q-pa-md" style="flex: 1; overflow-y: auto">
        <div class="q-gutter-y-md">
          <div class="text-subtitle2 q-mb-sm">
            Editing: <strong>{{ editingPlayer?.username }}</strong>
            <q-badge
              v-if="editingPlayer?.userId"
              color="blue-6"
              class="q-ml-sm"
            >
              <q-icon name="verified" size="12px" />
              <q-tooltip
                anchor="top middle"
                self="bottom middle"
                :offset="[8, 8]"
                >Read-only</q-tooltip
              >
            </q-badge>
          </div>

          <q-input
            :model-value="editPlayerName"
            @update:model-value="
              $emit(
                'update:editPlayerName',
                $event === null ? null : String($event),
              )
            "
            label="Player Name"
            type="text"
            :readonly="!!editingPlayer?.userId"
            :hint="
              editingPlayer?.userId
                ? 'Name managed by linked account'
                : undefined
            "
            outlined
            dense
            :bg-color="editingPlayer?.userId ? 'grey-2' : undefined"
          >
            <template v-slot:prepend>
              <q-icon name="person" />
            </template>
          </q-input>

          <q-select
            :model-value="editPlayerLevel"
            @update:model-value="$emit('update:editPlayerLevel', $event)"
            :options="levelOptions"
            label="Player Level"
            :rules="[(val) => val !== null || 'Player level is required']"
            :readonly="!!editingPlayer?.userId"
            :hint="
              editingPlayer?.userId
                ? 'Level managed by linked account'
                : undefined
            "
            outlined
            dense
            emit-value
            map-options
            :bg-color="editingPlayer?.userId ? 'grey-2' : undefined"
          >
            <template v-slot:prepend>
              <q-icon name="star" />
            </template>
            <template v-slot:option="scope">
              <q-item v-bind="scope.itemProps">
                <q-item-section avatar>
                  <q-icon
                    :name="getLevelIcon(scope.opt.value)"
                    :color="getLevelColor(scope.opt.value)"
                  />
                </q-item-section>
                <q-item-section>
                  <q-item-label>{{ scope.opt.label }}</q-item-label>
                  <q-item-label caption>{{
                    scope.opt.description
                  }}</q-item-label>
                </q-item-section>
              </q-item>
            </template>
          </q-select>

          <q-banner
            v-if="hasNameConflict"
            class="q-mt-md"
            color="warning"
            icon="warning"
          >
            <template v-slot:avatar>
              <q-icon name="warning" color="warning" />
            </template>
            Another player with this name already exists. Please choose a
            different name.
          </q-banner>
        </div>
      </q-card-section>

      <!-- Footer Actions -->
      <q-separator />
      <q-card-actions align="right" class="q-pa-md">
        <q-btn
          flat
          label="Cancel"
          color="grey"
          @click="$emit('update:modelValue', false)"
        />
        <q-btn
          color="accent"
          @click="$emit('save')"
          label="Save Changes"
          icon="save"
          :disable="
            !editPlayerName?.trim() ||
            editPlayerLevel === null ||
            hasNameConflict
          "
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { useQuasar } from 'quasar';
import DialogHeader from '../DialogHeader.vue';
import { getLevelIcon, getLevelColor } from '../../utils/playerHelpers';
import type { Player } from '../../services/matchmaking';

defineOptions({ name: 'EditPlayerDialog' });

const $q = useQuasar();

defineProps<{
  modelValue: boolean;
  editingPlayer: Player | null;
  editPlayerName: string | null;
  editPlayerLevel: 1 | 2 | 3 | null;
  hasNameConflict: boolean;
  levelOptions: Array<{ label: string; value: number; description: string }>;
}>();

defineEmits<{
  'update:modelValue': [value: boolean];
  'update:editPlayerName': [value: string | null];
  'update:editPlayerLevel': [value: 1 | 2 | 3 | null];
  save: [];
}>();
</script>
