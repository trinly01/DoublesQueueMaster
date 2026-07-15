<template>
  <TresGroup ref="groupRef" :rotation="[0, rotation, 0]">
    <!-- Body (capsule) -->
    <TresMesh :position="[0, 0.35, 0] as any" cast-shadow>
      <TresCapsuleGeometry :args="[0.22, 0.35, 8, 16]" />
      <TresMeshStandardMaterial :color="bodyColor" />
    </TresMesh>

    <!-- Head (big sphere) -->
    <TresMesh :position="[0, 0.85, 0] as any" cast-shadow>
      <TresSphereGeometry :args="[0.32, 16, 16]" />
      <TresMeshStandardMaterial :color="headColor" />
    </TresMesh>

    <!-- Eyes -->
    <TresMesh :position="[-0.12, 0.88, 0.27] as any">
      <TresSphereGeometry :args="[0.05, 8, 8]" />
      <TresMeshStandardMaterial color="#ffffff" />
    </TresMesh>
    <TresMesh :position="[0.12, 0.88, 0.27] as any">
      <TresSphereGeometry :args="[0.05, 8, 8]" />
      <TresMeshStandardMaterial color="#ffffff" />
    </TresMesh>
    <TresMesh :position="[-0.12, 0.88, 0.31] as any">
      <TresSphereGeometry :args="[0.025, 8, 8]" />
      <TresMeshStandardMaterial color="#222222" />
    </TresMesh>
    <TresMesh :position="[0.12, 0.88, 0.31] as any">
      <TresSphereGeometry :args="[0.025, 8, 8]" />
      <TresMeshStandardMaterial color="#222222" />
    </TresMesh>

    <!-- Smile -->
    <TresMesh :position="[0, 0.78, 0.29] as any" :rotation="[0.3, 0, 0]">
      <TresTorusGeometry :args="[0.08, 0.015, 8, 16, Math.PI]" />
      <TresMeshStandardMaterial color="#222222" />
    </TresMesh>

    <!-- Paddle (rounded pickleball shape, tilts when swinging) -->
    <TresGroup
      ref="paddleRef"
      :position="[paddleX, 0.55, 0.15] as any"
      :rotation="paddleRotation as any"
    >
      <!-- Paddle face: squashed cylinder for oval/rounded shape -->
      <TresMesh
        cast-shadow
        :rotation="[Math.PI / 2, 0, 0]"
        :scale="[1, 1, 1.25] as any"
      >
        <TresCylinderGeometry :args="[0.22, 0.22, 0.04, 24]" />
        <TresMeshStandardMaterial :color="paddleColor" />
      </TresMesh>
      <!-- Edge guard rim (light lining) -->
      <TresMesh :scale="[1.05, 1.31, 1] as any">
        <TresTorusGeometry :args="[0.22, 0.022, 12, 32]" />
        <TresMeshStandardMaterial color="#ffffff" />
      </TresMesh>
      <!-- Handle -->
      <TresMesh :position="[0, -0.24, 0] as any">
        <TresCylinderGeometry :args="[0.04, 0.04, 0.22, 12]" />
        <TresMeshStandardMaterial color="#8B4513" />
      </TresMesh>
      <!-- Handle grip wrap -->
      <TresMesh :position="[0, -0.24, 0] as any">
        <TresCylinderGeometry :args="[0.043, 0.043, 0.14, 12]" />
        <TresMeshStandardMaterial color="#222222" :opacity="0.8" transparent />
      </TresMesh>
    </TresGroup>
  </TresGroup>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

const props = withDefaults(
  defineProps<{
    rotation?: number;
    bodyColor?: string;
    headColor?: string;
    paddleColor?: string;
    swing?: number;
    paddleSide?: number; // 1 = right (AI), -1 = right of screen for player (rotated 180°)
  }>(),
  {
    rotation: 0,
    bodyColor: '#667eea',
    paddleColor: '#1a1a2e',
    headColor: '#FFD3B6',
    swing: 0,
    paddleSide: 1,
  },
);

const groupRef = ref();
const paddleRef = ref();

// Paddle position: slightly right of center, at paddle height
// Player has rotation=PI so local +x = world -x (left of screen)
// To put paddle on right of screen for player, use local -x (paddleSide = -1)
const paddleX = 0.25 * props.paddleSide;
const paddleTilt = -0.15 * props.paddleSide;

// Reactive rotation: swing animation rotates paddle forward (X) and across body (Z)
const paddleRotation = computed(() => [
  -props.swing * 1.8,
  0,
  paddleTilt + props.swing * 0.8 * props.paddleSide,
]);

defineExpose({ groupRef, paddleRef });
</script>
