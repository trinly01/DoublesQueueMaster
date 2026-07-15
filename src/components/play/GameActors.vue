<template>
  <!-- Camera: soft-follow player, keep court visible -->
  <TresPerspectiveCamera
    ref="cameraRef"
    :position="initialCamPos as any"
    :fov="45"
  />

  <!-- Player character -->
  <CuteCharacter
    ref="playerRef"
    :rotation="Math.PI"
    body-color="#667eea"
    :swing="refs.playerSwing"
    :paddle-side="-1"
  />

  <!-- AI character -->
  <CuteCharacter
    ref="aiRef"
    :rotation="0"
    body-color="#26A69A"
    head-color="#FFD3B6"
    :swing="refs.aiSwing"
    :paddle-side="1"
  />

  <!-- Ball (enlarged for mobile visibility) -->
  <TresMesh ref="ballRef" cast-shadow>
    <TresSphereGeometry :args="[0.11, 16, 16]" />
    <TresMeshStandardMaterial
      color="#fde047"
      :emissive="'#fde047'"
      :emissive-intensity="0.3"
    />
  </TresMesh>

  <!-- Ball shadow (enlarged) -->
  <TresMesh ref="shadowRef" :rotation="[-Math.PI / 2, 0, 0]">
    <TresCircleGeometry :args="[0.13, 16]" />
    <TresMeshBasicMaterial color="#1a1a2e" :opacity="0.3" transparent />
  </TresMesh>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useLoop } from '@tresjs/core';
import * as THREE from 'three';
import type { GameRefs } from 'src/composables/useGameEngine';
import CuteCharacter from 'components/play/CuteCharacter.vue';

const props = defineProps<{
  refs: GameRefs;
}>();

const playerRef = ref();
const aiRef = ref();
const ballRef = ref();
const shadowRef = ref();
const cameraRef = ref();

const COURT_LENGTH = 13.41;

// Initial camera position: behind player, elevated
const initialCamPos: [number, number, number] = [0, 6, COURT_LENGTH / 2 + 10];

// Smooth follow look target — shifted toward AI to see more of their side
const camLookTarget = new THREE.Vector3(0, 0, 3);

const { onBeforeRender } = useLoop();

let lastTime = 0;

onMounted(() => {
  onBeforeRender(({ elapsed }) => {
    const dt = lastTime > 0 ? Math.min(elapsed - lastTime, 0.05) : 0.016;
    lastTime = elapsed;

    const r = props.refs;

    // Update player position + lean
    if (playerRef.value?.groupRef) {
      playerRef.value.groupRef.position.set(r.playerPos.x, 0, r.playerPos.z);
      // Lean into movement direction (Z-axis tilt)
      // Player is rotated 180° so local Z lean is inverted
      const targetLean = -r.playerMoveDir * 0.25;
      playerRef.value.groupRef.rotation.z +=
        (targetLean - playerRef.value.groupRef.rotation.z) *
        Math.min(1, dt * 8);
    }
    // Update player paddle (position + rotation based on movement and swing)
    if (playerRef.value?.paddleRef) {
      const swing = r.playerSwing;
      const dir = r.playerSwingDir; // -1 = moving left, 1 = moving right
      const moveDir = r.playerMoveDir; // current movement -1..1
      const side = -1; // player paddleSide
      // Paddle shifts toward movement direction, extends forward during swing
      const baseX = 0.25 * side;
      const baseY = 0.55;
      const baseZ = 0.15;
      playerRef.value.paddleRef.position.set(
        baseX + moveDir * 0.15 * side, // shift toward movement
        baseY - swing * 0.1, // dip slightly during swing
        baseZ + swing * 0.2, // extend forward during swing
      );
      playerRef.value.paddleRef.rotation.set(
        -swing * 0.6,
        swing * 1.5 * dir,
        -0.15 * side,
      );
    }

    // Update AI position + lean
    if (aiRef.value?.groupRef) {
      aiRef.value.groupRef.position.set(r.aiPos.x, 0, r.aiPos.z);
      // Lean into movement direction
      const targetLean = r.aiMoveDir * 0.25;
      aiRef.value.groupRef.rotation.z +=
        (targetLean - aiRef.value.groupRef.rotation.z) * Math.min(1, dt * 8);
    }
    // Update AI paddle (position + rotation based on movement and swing)
    if (aiRef.value?.paddleRef) {
      const swing = r.aiSwing;
      const dir = r.aiSwingDir;
      const moveDir = r.aiMoveDir;
      const side = 1; // AI paddleSide
      const baseX = 0.25 * side;
      const baseY = 0.55;
      const baseZ = 0.15;
      aiRef.value.paddleRef.position.set(
        baseX + moveDir * 0.15 * side,
        baseY - swing * 0.1,
        baseZ + swing * 0.2,
      );
      aiRef.value.paddleRef.rotation.set(
        -swing * 0.6,
        swing * 1.5 * dir,
        -0.15 * side,
      );
    }

    // Update ball position
    if (ballRef.value) {
      ballRef.value.position.set(r.ballPos.x, r.ballPos.y, r.ballPos.z);
    }

    // Update ball shadow
    if (shadowRef.value) {
      shadowRef.value.position.set(r.ballPos.x, 0.01, r.ballPos.z);
    }

    // Soft-follow camera: follow midpoint of player and AI, keep height & z fixed
    if (cameraRef.value) {
      const cam = cameraRef.value;
      // Blend: weight player more since camera is behind player
      const midX = r.playerPos.x * 0.6 + r.aiPos.x * 0.2;
      cam.position.x += (midX - cam.position.x) * Math.min(1, dt * 4);

      // Look target follows both player and AI
      camLookTarget.x = r.playerPos.x * 0.35 + r.aiPos.x * 0.15;
      camLookTarget.z = 3 + r.playerPos.z * 0.1 - r.aiPos.z * 0.05;
      cam.lookAt(camLookTarget);
    }
  });
});
</script>
