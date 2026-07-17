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

  <!-- Bounce prediction indicator -->
  <TresMesh
    ref="bounceMarkerRef"
    :rotation="[-Math.PI / 2, 0, 0]"
    :visible="false"
  >
    <TresRingGeometry :args="[0.2, 0.3, 24]" />
    <TresMeshBasicMaterial color="#fde047" :opacity="0.6" transparent />
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
const bounceMarkerRef = ref();
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
    // Update player paddle (movement-based position, ball-direction when close, never through body)
    if (playerRef.value?.paddleRef) {
      const swing = r.playerSwing;
      const swingDir = r.playerSwingDir; // -1 = hit from left, 1 = hit from right
      const moveDir = r.playerMoveDir; // -1 = left, 1 = right
      const reach = r.playerReach; // 0..1 based on ball distance
      const angle = r.playerPaddleAngle; // direction toward ball
      const baseY = 0.55;
      // Movement-based position (inverted because player is rotated 180°)
      // Right by default, left when moving left — paddle in front and to the side
      const moveX = moveDir < -0.1 ? 0.22 : -0.22;
      const moveZ = 0.28;
      // Ball-direction position when ball is near
      const ballX = Math.sin(angle) * 0.22;
      const ballZ = -Math.cos(angle) * 0.04; // negative because player faces -Z
      // Blend: movement-based when reach=0, ball-based when reach=1
      const targetX = moveX * (1 - reach) + ballX * reach;
      const targetZ = moveZ * (1 - reach) + ballZ * reach;
      // Smoothly animate
      const curX = playerRef.value.paddleRef.position.x;
      const newPaddleX = curX + (targetX - curX) * Math.min(1, dt * 8);
      const curZ = playerRef.value.paddleRef.position.z;
      const newPaddleZ = curZ + (targetZ - curZ) * Math.min(1, dt * 8);
      // Push paddle forward when crossing center to avoid body
      const centerProximity = 1 - Math.min(1, Math.abs(newPaddleX) / 0.22);
      const safeZ = newPaddleZ + centerProximity * 0.05;
      playerRef.value.paddleRef.position.set(newPaddleX, baseY, safeZ);
      playerRef.value.paddleRef.rotation.set(
        -swing * 0.52 * swingDir, // X: tilt ~30° based on hit direction
        swing * 0.3 * swingDir, // Y: small rotation toward hit direction
        -swing * 0.26 * swingDir, // Z: tilt side based on hit direction
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
    // Update AI paddle (movement-based position, ball-direction when close, never through body)
    if (aiRef.value?.paddleRef) {
      const swing = r.aiSwing;
      const swingDir = r.aiSwingDir;
      const moveDir = r.aiMoveDir;
      const reach = r.aiReach;
      const angle = r.aiPaddleAngle;
      const baseY = 0.55;
      // Movement-based position
      const moveX = moveDir < -0.1 ? -0.22 : 0.22;
      const moveZ = 0.28;
      // Ball-direction position when ball is near
      const ballX = Math.sin(angle) * 0.22;
      const ballZ = Math.cos(angle) * 0.04; // positive because AI faces +Z
      const targetX = moveX * (1 - reach) + ballX * reach;
      const targetZ = moveZ * (1 - reach) + ballZ * reach;
      const curX = aiRef.value.paddleRef.position.x;
      const newPaddleX = curX + (targetX - curX) * Math.min(1, dt * 8);
      const curZ = aiRef.value.paddleRef.position.z;
      const newPaddleZ = curZ + (targetZ - curZ) * Math.min(1, dt * 8);
      const centerProximity = 1 - Math.min(1, Math.abs(newPaddleX) / 0.22);
      const safeZ = newPaddleZ + centerProximity * 0.05;
      aiRef.value.paddleRef.position.set(newPaddleX, baseY, safeZ);
      aiRef.value.paddleRef.rotation.set(
        -swing * 0.52 * swingDir, // X: tilt ~30° based on hit direction
        swing * 0.3 * swingDir, // Y: small rotation toward hit direction
        -swing * 0.26 * swingDir, // Z: tilt side based on hit direction
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

    // Update bounce prediction marker
    if (bounceMarkerRef.value) {
      if (r.ballBouncePredict) {
        bounceMarkerRef.value.visible = true;
        bounceMarkerRef.value.position.set(
          r.ballBouncePredict.x,
          0.03,
          r.ballBouncePredict.z,
        );
        // Pulse scale
        const pulse = 1 + Math.sin(elapsed * 6) * 0.15;
        bounceMarkerRef.value.scale.set(pulse, pulse, 1);
      } else {
        bounceMarkerRef.value.visible = false;
      }
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
