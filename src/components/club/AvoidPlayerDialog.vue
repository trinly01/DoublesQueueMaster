<template>
  <q-dialog ref="dialogRef" @hide="onDialogHide">
    <q-card class="bg-white" style="min-width: 300px; max-width: 92vw">
      <DialogHeader title="Avoid Player" icon="person_off" />

      <q-card-section class="q-pt-sm">
        <div class="text-body2 q-mb-sm">
          <strong>{{ sourceName }}</strong> avoids
          <strong>{{ targetName }}</strong>
        </div>
        <div class="text-caption text-grey-7 q-mb-md">
          They'll be drafted into different matches when possible. If forced
          into the same match, they'll always be on opposite teams — never
          teammates.
        </div>

        <q-checkbox
          v-model="bothWays"
          label="Apply both ways"
          color="primary"
          dense
        />
        <div class="text-caption text-grey-6 q-ml-lg">
          Also record that {{ targetName }} avoids {{ sourceName }}
        </div>
      </q-card-section>

      <q-separator />
      <q-card-actions align="between" class="q-pa-md">
        <q-btn
          v-if="existingAvoid"
          flat
          label="Remove"
          color="negative"
          icon="delete"
          @click="onRemove"
        />
        <span v-else />
        <div class="row q-gutter-sm">
          <q-btn flat label="Cancel" color="grey" @click="onDialogCancel" />
          <q-btn
            unelevated
            :label="existingAvoid ? 'Update' : 'Save'"
            color="primary"
            @click="onSave"
          />
        </div>
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useDialogPluginComponent } from 'quasar';
import DialogHeader from '../DialogHeader.vue';

defineOptions({ name: 'AvoidPlayerDialog' });

const props = defineProps<{
  sourceName: string;
  targetName: string;
  existingAvoid?: boolean;
  existingBothWays?: boolean;
}>();

defineEmits([...useDialogPluginComponent.emits]);

const { dialogRef, onDialogHide, onDialogOK, onDialogCancel } =
  useDialogPluginComponent();

const bothWays = ref<boolean>(props.existingBothWays ?? false);

const onSave = () => {
  onDialogOK({ bothWays: bothWays.value });
};

const onRemove = () => {
  onDialogOK({ remove: true });
};
</script>
