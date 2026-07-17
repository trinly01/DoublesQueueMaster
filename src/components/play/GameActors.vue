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
    :body-color="playerPalette.bodyColor"
    :hair-color="playerPalette.hairColor"
    :hat-color="playerPalette.hatColor"
    :pants-color="playerPalette.pantsColor"
    :shoe-color="playerPalette.shoeColor"
    :gender="playerPalette.gender"
    :has-hat="playerPalette.hasHat"
    :paddle-color="playerPalette.paddleColor"
    :paddle-handle-color="playerPalette.paddleHandleColor"
    :paddle-grip-color="playerPalette.paddleGripColor"
    :paddle-edge-color="playerPalette.paddleEdgeColor"
    :swing="refs.playerSwing"
    :paddle-side="-1"
  />

  <!-- AI character -->
  <CuteCharacter
    ref="aiRef"
    :rotation="0"
    :body-color="aiPalette.bodyColor"
    head-color="#FFD3B6"
    :hair-color="aiPalette.hairColor"
    :hat-color="aiPalette.hatColor"
    :pants-color="aiPalette.pantsColor"
    :shoe-color="aiPalette.shoeColor"
    :gender="aiPalette.gender"
    :has-hat="aiPalette.hasHat"
    :paddle-color="aiPalette.paddleColor"
    :paddle-handle-color="aiPalette.paddleHandleColor"
    :paddle-grip-color="aiPalette.paddleGripColor"
    :paddle-edge-color="aiPalette.paddleEdgeColor"
    :swing="refs.aiSwing"
    :paddle-side="1"
  />

  <!-- Ball (enlarged for mobile visibility) -->
  <TresMesh ref="ballRef">
    <TresSphereGeometry :args="[0.11, 10, 8]" />
    <TresMeshStandardMaterial
      color="#fde047"
      :emissive="'#fde047'"
      :emissive-intensity="0.3"
    />
  </TresMesh>

  <!-- Ball shadow (enlarged) -->
  <TresMesh ref="shadowRef" :rotation="[-Math.PI / 2, 0, 0]">
    <TresCircleGeometry :args="[0.13, 12]" />
    <TresMeshBasicMaterial color="#1a1a2e" :opacity="0.3" transparent />
  </TresMesh>

  <!-- Player blob shadow -->
  <TresMesh ref="playerShadowRef" :rotation="[-Math.PI / 2, 0, 0]">
    <TresCircleGeometry :args="[0.32, 16]" />
    <TresMeshBasicMaterial color="#1a1a2e" :opacity="0.28" transparent />
  </TresMesh>

  <!-- AI blob shadow -->
  <TresMesh ref="aiShadowRef" :rotation="[-Math.PI / 2, 0, 0]">
    <TresCircleGeometry :args="[0.32, 16]" />
    <TresMeshBasicMaterial color="#1a1a2e" :opacity="0.28" transparent />
  </TresMesh>

  <!-- Bounce prediction indicator -->
  <TresMesh
    ref="bounceMarkerRef"
    :rotation="[-Math.PI / 2, 0, 0]"
    :visible="false"
  >
    <TresRingGeometry :args="[0.2, 0.3, 16]" />
    <TresMeshBasicMaterial color="#fde047" :opacity="0.6" transparent />
  </TresMesh>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useLoop } from '@tresjs/core';
import * as THREE from 'three';
import type { GameRefs } from 'src/composables/useGameEngine';
import CuteCharacter from 'components/play/CuteCharacter.vue';
import { useRandomPalette } from 'src/composables/useRandomPalette';

const props = defineProps<{
  refs: GameRefs;
  step: (time: number) => void;
}>();

const { randomPalette } = useRandomPalette();
const playerPalette = ref(randomPalette());
const aiPalette = ref(randomPalette());
// Ensure player and AI always have different colors
if (aiPalette.value.bodyColor === playerPalette.value.bodyColor) {
  aiPalette.value = randomPalette();
}

const playerRef = ref();
const aiRef = ref();
const ballRef = ref();
const shadowRef = ref();
const playerShadowRef = ref();
const aiShadowRef = ref();
const bounceMarkerRef = ref();
const cameraRef = ref();

const COURT_LENGTH = 13.41;

// Initial camera position: behind player, elevated
const initialCamPos: [number, number, number] = [0, 6, COURT_LENGTH / 2 + 10];

// Smooth follow look target — shifted toward AI to see more of their side
const camLookTarget = new THREE.Vector3(0, 0, 3);

const { onBeforeRender } = useLoop();

let lastTime = 0;

// Walk-cycle phase accumulators (advanced by dt, not elapsed*speed)
let playerWalkPhase = 0;
let aiWalkPhase = 0;
// Smoothed animation magnitude (eases in/out instead of hard cutoff)
let playerAnimMagSmooth = 0;
let aiAnimMagSmooth = 0;
// Last stable move angle (prevents sign flip when velocity ~0)
let playerMoveAngleStable = 0;
let aiMoveAngleStable = 0;
// Bounce marker smoothing state (render-side interpolation)
const markerPos = new THREE.Vector3();
const markerTarget = new THREE.Vector3();
let markerOpacity = 0;
let markerMissTime = 0;
let markerHasTarget = false;

onMounted(() => {
  // Set initial base rotations
  if (playerRef.value?.groupRef) {
    playerRef.value.groupRef.rotation.y = Math.PI;
  }
  if (aiRef.value?.groupRef) {
    aiRef.value.groupRef.rotation.y = 0;
  }
  onBeforeRender(({ elapsed }) => {
    // Run game physics step first (merged from separate RAF)
    props.step(elapsed);
    // dt for animation interpolation
    const dt = lastTime > 0 ? Math.min(elapsed - lastTime, 0.05) : 0.016;
    lastTime = elapsed;

    const r = props.refs;

    // Update player position + body rotation toward movement + leg/arm animation
    if (playerRef.value?.groupRef) {
      playerRef.value.groupRef.position.set(r.playerPos.x, 0, r.playerPos.z);
      // Body rotation (imperative — player base rotation is PI)
      const moveAngle = Math.atan2(-r.playerMoveDir, -r.playerMoveZ);
      const moveMagBody = Math.sqrt(
        r.playerMoveDir * r.playerMoveDir + r.playerMoveZ * r.playerMoveZ,
      );
      // When at rest, face forward toward opponent
      let targetBodyY: number;
      if (moveMagBody < 0.05) {
        // Player base facing is PI (toward -Z / opponent)
        targetBodyY = Math.PI;
      } else {
        targetBodyY = Math.PI + moveAngle * 0.6;
      }
      const targetLean = -r.playerMoveDir * 0.4;
      const targetPitch = -r.playerMoveZ * 0.3;
      const k = Math.min(1, dt * 6);
      const kLean = Math.min(1, dt * 8);
      playerRef.value.groupRef.rotation.y +=
        (targetBodyY - playerRef.value.groupRef.rotation.y) * k;
      playerRef.value.groupRef.rotation.z +=
        (targetLean - playerRef.value.groupRef.rotation.z) * kLean;
      playerRef.value.groupRef.rotation.x +=
        (targetPitch - playerRef.value.groupRef.rotation.x) * kLean;
      // Leg swing: reuse moveMagBody (same value, avoid redundant sqrt)
      const moveMag = Math.min(1, moveMagBody);
      // Smooth animMag: ease in/out instead of hard cutoff
      playerAnimMagSmooth = THREE.MathUtils.damp(
        playerAnimMagSmooth,
        moveMag,
        8,
        dt,
      );
      const animMag = playerAnimMagSmooth;
      // Stabilize moveAngle: hold last stable angle when nearly stopped
      if (moveMag > 0.08) {
        playerMoveAngleStable = moveAngle;
      }
      const stableAngle = playerMoveAngleStable;
      // Accumulate walk phase with dt (continuous when speed changes)
      const walkSpeed = 6 + animMag * 8;
      playerWalkPhase += dt * walkSpeed;
      const swingBase = Math.sin(playerWalkPhase) * 0.6 * animMag;
      // Project swing onto movement direction: X rotation for forward/back, Z for side
      const swingX = swingBase * Math.cos(stableAngle);
      const swingZ = swingBase * Math.sin(stableAngle);
      const kLimb = Math.min(1, dt * 12);
      if (playerRef.value.leftLegRef) {
        playerRef.value.leftLegRef.rotation.x +=
          (swingX - playerRef.value.leftLegRef.rotation.x) * kLimb;
        playerRef.value.leftLegRef.rotation.z +=
          (swingZ - playerRef.value.leftLegRef.rotation.z) * kLimb;
      }
      if (playerRef.value.rightLegRef) {
        playerRef.value.rightLegRef.rotation.x +=
          (-swingX - playerRef.value.rightLegRef.rotation.x) * kLimb;
        playerRef.value.rightLegRef.rotation.z +=
          (-swingZ - playerRef.value.rightLegRef.rotation.z) * kLimb;
      }
      // Free arm (left) swings opposite to legs
      if (playerRef.value.leftArmRef) {
        playerRef.value.leftArmRef.rotation.x +=
          (-swingX * 0.7 - playerRef.value.leftArmRef.rotation.x) * kLimb;
        playerRef.value.leftArmRef.rotation.z +=
          (-swingZ * 0.7 - playerRef.value.leftArmRef.rotation.z) * kLimb;
      }
      // Head faces opponent during serve, ball during rally
      // Head is child of body group, so local yaw = world yaw - body actual
      if (playerRef.value.headRef) {
        // Player faces -Z (PI). Look toward AI position.
        const dxTarget = r.servePending
          ? r.aiPos.x - r.playerPos.x
          : r.ballPos.x - r.playerPos.x;
        const dzTarget = r.servePending
          ? r.aiPos.z - r.playerPos.z
          : r.ballPos.z - r.playerPos.z;
        const targetDist = Math.sqrt(dxTarget * dxTarget + dzTarget * dzTarget);
        // World yaw to face target = atan2(dx, dz) regardless of base facing
        const worldHeadYaw = Math.atan2(dxTarget, dzTarget);
        const bodyY = playerRef.value.groupRef.rotation.y;
        const targetHeadYaw = worldHeadYaw - bodyY;
        // Normalize to [-PI, PI] then clamp to forward arc (±60°)
        let normYaw = targetHeadYaw;
        while (normYaw > Math.PI) normYaw -= 2 * Math.PI;
        while (normYaw < -Math.PI) normYaw += 2 * Math.PI;
        const clampedHeadYaw = Math.max(
          -Math.PI / 3,
          Math.min(Math.PI / 3, normYaw),
        );
        const dyTarget = r.servePending ? 0 : r.ballPos.y - 0.68;
        const targetHeadPitch = Math.atan2(dyTarget, Math.max(targetDist, 0.1));
        // Clamp pitch: max 45° down, 75° up — track high balls
        const clampedHeadPitch = Math.max(
          -Math.PI / 4,
          Math.min((Math.PI * 5) / 12, targetHeadPitch),
        );
        const k = Math.min(1, dt * 8);
        playerRef.value.headRef.rotation.y +=
          (clampedHeadYaw - playerRef.value.headRef.rotation.y) * k;
        playerRef.value.headRef.rotation.x +=
          (clampedHeadPitch - playerRef.value.headRef.rotation.x) * k;
      }
      // Pupils track ball (via reactive prop)
      const playerPupils = playerRef.value.pupilPositions?.value;
      if (playerPupils) {
        const dxBall = r.ballPos.x - r.playerPos.x;
        const dzBall = r.ballPos.z - r.playerPos.z;
        const ballDist = Math.sqrt(dxBall * dxBall + dzBall * dzBall);
        const nx = ballDist > 0 ? dxBall / ballDist : 0;
        const nz = ballDist > 0 ? dzBall / ballDist : 0;
        const dy = (r.ballPos.y - 0.68) / Math.max(ballDist, 0.5);
        const pupilOffX = nx * 0.03;
        const pupilOffY = Math.max(-0.025, Math.min(0.025, dy * 0.03));
        const pupilOffZ = -nz * 0.02;
        playerPupils.lx = -0.15 + pupilOffX;
        playerPupils.ly = 0.03 + pupilOffY;
        playerPupils.lz = 0.37 + pupilOffZ;
        playerPupils.rx = 0.15 + pupilOffX;
        playerPupils.ry = 0.03 + pupilOffY;
        playerPupils.rz = 0.37 + pupilOffZ;
        playerPupils.lsx = -0.13 + pupilOffX;
        playerPupils.lsy = 0.06 + pupilOffY;
        playerPupils.lsz = 0.4 + pupilOffZ;
        playerPupils.rsx = 0.17 + pupilOffX;
        playerPupils.rsy = 0.06 + pupilOffY;
        playerPupils.rsz = 0.4 + pupilOffZ;
      }
    }
    // Update player paddle (movement-based position, ball-direction when close, never through body)
    if (playerRef.value?.paddleRef) {
      const swing = r.playerSwing;
      const swingDir = r.playerSwingDir; // -1 = hit from left, 1 = hit from right
      const moveDir = r.playerMoveDir; // -1 = left, 1 = right
      const reach = r.playerReach; // 0..1 based on ball distance
      const angle = r.playerPaddleAngle; // direction toward ball
      const baseY = 0.22;
      // Handle moves left/forward/right — never backward into body
      const handleX = moveDir < -0.1 ? -0.15 : 0.15;
      const handleZ = 0.22; // always forward enough to clear body
      // Ball-direction handle offset when ball is near
      const ballHandleX = Math.sin(angle) * 0.1;
      const ballHandleZ = -Math.cos(angle) * 0.06;
      const targetX = handleX * (1 - reach) + ballHandleX * reach;
      const targetZ = handleZ * (1 - reach) + ballHandleZ * reach;
      // Smoothly animate handle position
      const curX = playerRef.value.paddleRef.position.x;
      let newPaddleX = curX + (targetX - curX) * Math.min(1, dt * 8);
      const curZ = playerRef.value.paddleRef.position.z;
      let newPaddleZ = curZ + (targetZ - curZ) * Math.min(1, dt * 8);
      // Clamp X: limit how far paddle goes from body
      newPaddleX = Math.max(-0.2, Math.min(0.2, newPaddleX));
      // Clamp Z: always forward, never into body, limit how far out
      newPaddleZ = Math.max(0.2, Math.min(0.45, newPaddleZ));
      // Push further forward when near center to avoid body collision
      const centerProximity = 1 - Math.min(1, Math.abs(newPaddleX) / 0.2);
      newPaddleZ += centerProximity * 0.08;
      newPaddleZ = Math.min(0.5, newPaddleZ);
      playerRef.value.paddleRef.position.set(newPaddleX, baseY, newPaddleZ);
      // Paddle Y rotation faces the ball
      // Player faces -Z, so paddle yaw = atan2(dxBall, -dzBall) to face ball
      const dxBall = r.ballPos.x - r.playerPos.x;
      const dzBall = r.ballPos.z - r.playerPos.z;
      const paddleYaw =
        Math.atan2(dxBall, -dzBall) - playerRef.value.groupRef.rotation.y;
      playerRef.value.paddleRef.rotation.set(
        -swing * 0.52 * swingDir, // X: tilt ~30° based on hit direction
        paddleYaw, // Y: face the ball
        -swing * 0.26 * swingDir, // Z: tilt side based on hit direction
      );
      // Paddle-side arm (right) points toward paddle — arm+hand move as one group
      if (playerRef.value.rightArmRef) {
        const shoulderX = 0.22;
        const shoulderY = 0.38;
        const shoulderZ = 0;
        const dx = newPaddleX - shoulderX;
        const dy = baseY - shoulderY;
        const dz = newPaddleZ - shoulderZ;
        const armYaw = Math.atan2(dx, dz);
        const armPitch = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz));
        playerRef.value.rightArmRef.rotation.y +=
          (armYaw - playerRef.value.rightArmRef.rotation.y) *
          Math.min(1, dt * 10);
        playerRef.value.rightArmRef.rotation.x +=
          (armPitch - playerRef.value.rightArmRef.rotation.x) *
          Math.min(1, dt * 10);
      }
    }

    // Update AI position + body rotation toward movement + leg/arm animation
    if (aiRef.value?.groupRef) {
      aiRef.value.groupRef.position.set(r.aiPos.x, 0, r.aiPos.z);
      // Body rotation (imperative — AI base rotation is 0, faces +Z)
      const aiMoveAngle = Math.atan2(-r.aiMoveDir, r.aiMoveZ);
      const aiMoveMagBody = Math.sqrt(
        r.aiMoveDir * r.aiMoveDir + r.aiMoveZ * r.aiMoveZ,
      );
      // When at rest, face forward toward opponent
      let targetBodyY: number;
      if (aiMoveMagBody < 0.05) {
        // AI base facing is 0 (toward +Z / opponent)
        targetBodyY = 0;
      } else {
        targetBodyY = aiMoveAngle * 0.6;
      }
      const targetLean = r.aiMoveDir * 0.4;
      const targetPitch = r.aiMoveZ * 0.3;
      const k = Math.min(1, dt * 6);
      const kLean = Math.min(1, dt * 8);
      aiRef.value.groupRef.rotation.y +=
        (targetBodyY - aiRef.value.groupRef.rotation.y) * k;
      aiRef.value.groupRef.rotation.z +=
        (targetLean - aiRef.value.groupRef.rotation.z) * kLean;
      aiRef.value.groupRef.rotation.x +=
        (targetPitch - aiRef.value.groupRef.rotation.x) * kLean;
      // Leg swing: reuse aiMoveMagBody (same value, avoid redundant sqrt)
      const aiMoveMag = Math.min(1, aiMoveMagBody);
      // Smooth animMag: ease in/out instead of hard cutoff
      aiAnimMagSmooth = THREE.MathUtils.damp(aiAnimMagSmooth, aiMoveMag, 8, dt);
      const aiAnimMag = aiAnimMagSmooth;
      // Stabilize moveAngle: hold last stable angle when nearly stopped
      if (aiMoveMag > 0.08) {
        aiMoveAngleStable = aiMoveAngle;
      }
      const aiStableAngle = aiMoveAngleStable;
      // Accumulate walk phase with dt (continuous when speed changes)
      const aiWalkSpeed = 6 + aiAnimMag * 8;
      aiWalkPhase += dt * aiWalkSpeed;
      const aiSwingBase = Math.sin(aiWalkPhase) * 0.6 * aiAnimMag;
      const aiSwingX = aiSwingBase * Math.cos(aiStableAngle);
      const aiSwingZ = aiSwingBase * Math.sin(aiStableAngle);
      const kLimbAi = Math.min(1, dt * 12);
      if (aiRef.value.leftLegRef) {
        aiRef.value.leftLegRef.rotation.x +=
          (aiSwingX - aiRef.value.leftLegRef.rotation.x) * kLimbAi;
        aiRef.value.leftLegRef.rotation.z +=
          (aiSwingZ - aiRef.value.leftLegRef.rotation.z) * kLimbAi;
      }
      if (aiRef.value.rightLegRef) {
        aiRef.value.rightLegRef.rotation.x +=
          (-aiSwingX - aiRef.value.rightLegRef.rotation.x) * kLimbAi;
        aiRef.value.rightLegRef.rotation.z +=
          (-aiSwingZ - aiRef.value.rightLegRef.rotation.z) * kLimbAi;
      }
      // Free arm (left) swings opposite to legs
      if (aiRef.value.leftArmRef) {
        aiRef.value.leftArmRef.rotation.x +=
          (-aiSwingX * 0.7 - aiRef.value.leftArmRef.rotation.x) * kLimbAi;
        aiRef.value.leftArmRef.rotation.z +=
          (-aiSwingZ * 0.7 - aiRef.value.leftArmRef.rotation.z) * kLimbAi;
      }
      // Head faces opponent during serve, ball during rally
      // Head is child of body group, so local yaw = world yaw - body actual
      if (aiRef.value.headRef) {
        // AI faces +Z. Look toward player position during serve, ball during rally.
        const dxTarget = r.servePending
          ? r.playerPos.x - r.aiPos.x
          : r.ballPos.x - r.aiPos.x;
        const dzTarget = r.servePending
          ? r.playerPos.z - r.aiPos.z
          : r.ballPos.z - r.aiPos.z;
        const targetDist = Math.sqrt(dxTarget * dxTarget + dzTarget * dzTarget);
        // AI faces +Z, so world yaw = atan2(dx, dz)
        const worldHeadYaw = Math.atan2(dxTarget, dzTarget);
        const aiBodyY = aiRef.value.groupRef.rotation.y;
        const targetHeadYaw = worldHeadYaw - aiBodyY;
        // Normalize to [-PI, PI] then clamp to forward arc (±60°)
        let normYaw = targetHeadYaw;
        while (normYaw > Math.PI) normYaw -= 2 * Math.PI;
        while (normYaw < -Math.PI) normYaw += 2 * Math.PI;
        const clampedHeadYaw = Math.max(
          -Math.PI / 3,
          Math.min(Math.PI / 3, normYaw),
        );
        const dyTarget = r.servePending ? 0 : r.ballPos.y - 0.68;
        const targetHeadPitch = Math.atan2(dyTarget, Math.max(targetDist, 0.1));
        // Clamp pitch: max 45° down, 75° up — track high balls
        const clampedHeadPitch = Math.max(
          -Math.PI / 4,
          Math.min((Math.PI * 5) / 12, targetHeadPitch),
        );
        const k = Math.min(1, dt * 8);
        aiRef.value.headRef.rotation.y +=
          (clampedHeadYaw - aiRef.value.headRef.rotation.y) * k;
        aiRef.value.headRef.rotation.x +=
          (-clampedHeadPitch - aiRef.value.headRef.rotation.x) * k;
      }
      // Pupils track ball
      const aiPupils = aiRef.value.pupilPositions?.value;
      if (aiPupils) {
        const dxBall = r.ballPos.x - r.aiPos.x;
        const dzBall = r.ballPos.z - r.aiPos.z;
        const ballDist = Math.sqrt(dxBall * dxBall + dzBall * dzBall);
        const nx = ballDist > 0 ? dxBall / ballDist : 0;
        const nz = ballDist > 0 ? dzBall / ballDist : 0;
        const dy = (r.ballPos.y - 0.68) / Math.max(ballDist, 0.5);
        const pupilOffX = nx * 0.03;
        const pupilOffY = Math.max(-0.025, Math.min(0.025, dy * 0.03));
        const pupilOffZ = nz * 0.02;
        aiPupils.lx = -0.15 + pupilOffX;
        aiPupils.ly = 0.03 + pupilOffY;
        aiPupils.lz = 0.37 + pupilOffZ;
        aiPupils.rx = 0.15 + pupilOffX;
        aiPupils.ry = 0.03 + pupilOffY;
        aiPupils.rz = 0.37 + pupilOffZ;
        aiPupils.lsx = -0.13 + pupilOffX;
        aiPupils.lsy = 0.06 + pupilOffY;
        aiPupils.lsz = 0.4 + pupilOffZ;
        aiPupils.rsx = 0.17 + pupilOffX;
        aiPupils.rsy = 0.06 + pupilOffY;
        aiPupils.rsz = 0.4 + pupilOffZ;
      }
    }
    // Update AI paddle (movement-based position, ball-direction when close, never through body)
    if (aiRef.value?.paddleRef) {
      const swing = r.aiSwing;
      const swingDir = r.aiSwingDir;
      const moveDir = r.aiMoveDir;
      const reach = r.aiReach;
      const angle = r.aiPaddleAngle;
      const baseY = 0.22;
      // Handle moves left/forward/right — never backward into body
      const handleX = moveDir < -0.1 ? -0.15 : 0.15;
      const handleZ = 0.22; // always forward enough to clear body
      // Ball-direction handle offset when ball is near
      const ballHandleX = Math.sin(angle) * 0.1;
      const ballHandleZ = Math.cos(angle) * 0.06;
      const targetX = handleX * (1 - reach) + ballHandleX * reach;
      const targetZ = handleZ * (1 - reach) + ballHandleZ * reach;
      // Smoothly animate handle position
      const curX = aiRef.value.paddleRef.position.x;
      let newPaddleX = curX + (targetX - curX) * Math.min(1, dt * 8);
      const curZ = aiRef.value.paddleRef.position.z;
      let newPaddleZ = curZ + (targetZ - curZ) * Math.min(1, dt * 8);
      // Clamp X: limit how far paddle goes from body
      newPaddleX = Math.max(-0.2, Math.min(0.2, newPaddleX));
      // Clamp Z: always forward, never into body, limit how far out
      newPaddleZ = Math.max(0.2, Math.min(0.45, newPaddleZ));
      // Push further forward when near center to avoid body collision
      const centerProximity = 1 - Math.min(1, Math.abs(newPaddleX) / 0.2);
      newPaddleZ += centerProximity * 0.08;
      newPaddleZ = Math.min(0.5, newPaddleZ);
      aiRef.value.paddleRef.position.set(newPaddleX, baseY, newPaddleZ);
      // Paddle Y rotation faces the ball
      // AI faces +Z, so paddle yaw = atan2(dxBall, dzBall) to face ball
      const aiDxBall = r.ballPos.x - r.aiPos.x;
      const aiDzBall = r.ballPos.z - r.aiPos.z;
      const paddleYaw =
        Math.atan2(aiDxBall, aiDzBall) - aiRef.value.groupRef.rotation.y;
      aiRef.value.paddleRef.rotation.set(
        -swing * 0.52 * swingDir, // X: tilt ~30° based on hit direction
        paddleYaw, // Y: face the ball
        -swing * 0.26 * swingDir, // Z: tilt side based on hit direction
      );
      // Paddle-side arm points toward paddle — arm+hand move as one group
      if (aiRef.value.rightArmRef) {
        const shoulderX = -0.22; // mirrored for AI
        const shoulderY = 0.38;
        const shoulderZ = 0;
        const dx = newPaddleX - shoulderX;
        const dy = baseY - shoulderY;
        const dz = newPaddleZ - shoulderZ;
        const armYaw = Math.atan2(dx, dz);
        const armPitch = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz));
        aiRef.value.rightArmRef.rotation.y +=
          (armYaw - aiRef.value.rightArmRef.rotation.y) * Math.min(1, dt * 10);
        aiRef.value.rightArmRef.rotation.x +=
          (armPitch - aiRef.value.rightArmRef.rotation.x) *
          Math.min(1, dt * 10);
      }
    }

    // Update ball position
    if (ballRef.value) {
      ballRef.value.position.set(r.ballPos.x, r.ballPos.y, r.ballPos.z);
    }

    // Update ball shadow
    if (shadowRef.value) {
      shadowRef.value.position.set(r.ballPos.x, 0.01, r.ballPos.z);
    }

    // Update player blob shadow
    if (playerShadowRef.value) {
      playerShadowRef.value.position.set(r.playerPos.x, 0.01, r.playerPos.z);
    }

    // Update AI blob shadow
    if (aiShadowRef.value) {
      aiShadowRef.value.position.set(r.aiPos.x, 0.01, r.aiPos.z);
    }

    // Update bounce prediction marker (smoothed render-side)
    if (bounceMarkerRef.value) {
      const mesh = bounceMarkerRef.value;
      const mat = mesh.material;

      if (r.ballBouncePredict) {
        markerTarget.set(r.ballBouncePredict.x, 0.03, r.ballBouncePredict.z);
        markerMissTime = 0;
        markerHasTarget = true;
      } else {
        markerMissTime += dt;
        if (markerMissTime > 0.15) {
          markerHasTarget = false;
        }
      }

      if (markerHasTarget) {
        // Snap on large jumps (fresh hit), else lerp smoothly
        const dist = markerPos.distanceTo(markerTarget);
        if (dist > 3) {
          markerPos.copy(markerTarget);
        } else {
          const lerpFactor = Math.min(1, dt * 12);
          markerPos.x += (markerTarget.x - markerPos.x) * lerpFactor;
          markerPos.y += (markerTarget.y - markerPos.y) * lerpFactor;
          markerPos.z += (markerTarget.z - markerPos.z) * lerpFactor;
        }
        mesh.position.copy(markerPos);

        // Pulse scale
        const pulse = 1 + Math.sin(elapsed * 6) * 0.15;
        mesh.scale.set(pulse, pulse, 1);
      }

      // Fade opacity smoothly
      const opacityTarget = markerHasTarget ? 0.6 : 0;
      markerOpacity += (opacityTarget - markerOpacity) * Math.min(1, dt * 10);
      if (mat) mat.opacity = markerOpacity;
      mesh.visible = markerOpacity > 0.02;
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
