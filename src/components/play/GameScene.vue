<template>
  <TresCanvas shadows clear-color="#667eea">
    <!-- Lighting -->
    <TresAmbientLight :intensity="0.6" />
    <TresDirectionalLight
      :position="[5, 10, 5] as any"
      :intensity="1.2"
      cast-shadow
    />

    <!-- Ground (green area around court) -->
    <TresMesh
      :rotation="[-Math.PI / 2, 0, 0]"
      :position="[0, -0.01, 0] as any"
      receive-shadow
    >
      <TresPlaneGeometry :args="[30, 40]" />
      <TresMeshStandardMaterial color="#5b7c99" />
    </TresMesh>

    <!-- Court surface -->
    <TresMesh
      :rotation="[-Math.PI / 2, 0, 0]"
      :position="[0, 0, 0] as any"
      receive-shadow
    >
      <TresPlaneGeometry :args="[COURT_WIDTH, COURT_LENGTH]" />
      <TresMeshStandardMaterial color="#764ba2" />
    </TresMesh>

    <!-- Court lines (thin white planes) -->
    <!-- Outer boundary (4 sides) -->
    <TresMesh
      :rotation="[-Math.PI / 2, 0, 0]"
      :position="[0, 0.02, -COURT_LENGTH / 2] as any"
    >
      <TresPlaneGeometry :args="[COURT_WIDTH, 0.05]" />
      <TresMeshBasicMaterial color="#ffffff" />
    </TresMesh>
    <TresMesh
      :rotation="[-Math.PI / 2, 0, 0]"
      :position="[0, 0.02, COURT_LENGTH / 2] as any"
    >
      <TresPlaneGeometry :args="[COURT_WIDTH, 0.05]" />
      <TresMeshBasicMaterial color="#ffffff" />
    </TresMesh>
    <TresMesh
      :rotation="[-Math.PI / 2, 0, Math.PI / 2]"
      :position="[-COURT_WIDTH / 2, 0.02, 0] as any"
    >
      <TresPlaneGeometry :args="[COURT_LENGTH, 0.05]" />
      <TresMeshBasicMaterial color="#ffffff" />
    </TresMesh>
    <TresMesh
      :rotation="[-Math.PI / 2, 0, Math.PI / 2]"
      :position="[COURT_WIDTH / 2, 0.02, 0] as any"
    >
      <TresPlaneGeometry :args="[COURT_LENGTH, 0.05]" />
      <TresMeshBasicMaterial color="#ffffff" />
    </TresMesh>

    <!-- Center line (net) -->
    <TresMesh :rotation="[-Math.PI / 2, 0, 0]" :position="[0, 0.02, 0] as any">
      <TresPlaneGeometry :args="[COURT_WIDTH, 0.05]" />
      <TresMeshBasicMaterial color="#ffffff" />
    </TresMesh>

    <!-- Kitchen lines (player side) -->
    <TresMesh
      :rotation="[-Math.PI / 2, 0, 0]"
      :position="[0, 0.02, KITCHEN_DEPTH] as any"
    >
      <TresPlaneGeometry :args="[COURT_WIDTH, 0.05]" />
      <TresMeshBasicMaterial color="#ffffff" />
    </TresMesh>
    <!-- Kitchen lines (AI side) -->
    <TresMesh
      :rotation="[-Math.PI / 2, 0, 0]"
      :position="[0, 0.02, -KITCHEN_DEPTH] as any"
    >
      <TresPlaneGeometry :args="[COURT_WIDTH, 0.05]" />
      <TresMeshBasicMaterial color="#ffffff" />
    </TresMesh>

    <!-- Center service line (player side) -->
    <TresMesh
      :rotation="[-Math.PI / 2, 0, Math.PI / 2]"
      :position="[0, 0.02, (KITCHEN_DEPTH + COURT_LENGTH / 2) / 2] as any"
    >
      <TresPlaneGeometry :args="[COURT_LENGTH / 2 - KITCHEN_DEPTH, 0.04]" />
      <TresMeshBasicMaterial color="#ffffff" />
    </TresMesh>

    <!-- Center service line (AI side) -->
    <TresMesh
      :rotation="[-Math.PI / 2, 0, Math.PI / 2]"
      :position="[0, 0.02, -(KITCHEN_DEPTH + COURT_LENGTH / 2) / 2] as any"
    >
      <TresPlaneGeometry :args="[COURT_LENGTH / 2 - KITCHEN_DEPTH, 0.04]" />
      <TresMeshBasicMaterial color="#ffffff" />
    </TresMesh>

    <!-- Net -->
    <TresMesh :position="[0, NET_HEIGHT / 2, 0] as any">
      <TresBoxGeometry :args="[COURT_WIDTH, NET_HEIGHT, 0.03]" />
      <TresMeshStandardMaterial color="#1a1a2e" :opacity="0.35" transparent />
    </TresMesh>
    <!-- Net posts -->
    <TresMesh :position="[-COURT_WIDTH / 2, 0.5, 0] as any">
      <TresCylinderGeometry :args="[0.04, 0.04, 1, 8]" />
      <TresMeshStandardMaterial color="#e0e0e0" />
    </TresMesh>
    <TresMesh :position="[COURT_WIDTH / 2, 0.5, 0] as any">
      <TresCylinderGeometry :args="[0.04, 0.04, 1, 8]" />
      <TresMeshStandardMaterial color="#e0e0e0" />
    </TresMesh>

    <!-- Transparent walls at net (prevent crossing within court) -->
    <TresMesh :position="[0, NET_HEIGHT / 2, 0] as any">
      <TresBoxGeometry :args="[COURT_WIDTH, NET_HEIGHT, 0.02]" />
      <TresMeshBasicMaterial
        color="#667eea"
        :opacity="0.08"
        transparent
        :side="2"
      />
    </TresMesh>
    <!-- Wall top edge highlight -->
    <TresMesh :position="[0, NET_HEIGHT, 0] as any">
      <TresBoxGeometry :args="[COURT_WIDTH, 0.03, 0.03]" />
      <TresMeshBasicMaterial color="#667eea" :opacity="0.3" transparent />
    </TresMesh>

    <!-- Dynamic actors (player, AI, ball) — updated per-frame via useRenderLoop -->
    <GameActors :refs="refs" />
  </TresCanvas>
</template>

<script setup lang="ts">
import { TresCanvas } from '@tresjs/core';
import type { GameRefs } from 'src/composables/useGameEngine';
import GameActors from 'components/play/GameActors.vue';

defineProps<{
  refs: GameRefs;
}>();

const COURT_LENGTH = 13.41;
const COURT_WIDTH = 6.1;
const NET_HEIGHT = 0.86;
const KITCHEN_DEPTH = 2.13;
</script>
