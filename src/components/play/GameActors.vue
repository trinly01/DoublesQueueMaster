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
    :rotation="playerBaseRot"
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
    :paddle-side="playerFacing"
  />

  <!-- AI character -->
  <CuteCharacter
    ref="aiRef"
    :rotation="aiBaseRot"
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
    :paddle-side="aiFacing"
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
import { ref, onMounted, computed, watch } from 'vue';
import { useLoop } from '@tresjs/core';
import * as THREE from 'three';
import type { GameRefs } from 'src/composables/useGameEngine';
import type { CharacterPalette } from 'src/composables/useRandomPalette';
import CuteCharacter from 'components/play/CuteCharacter.vue';

const props = defineProps<{
  refs: GameRefs;
  step: (time: number) => void;
  flipView?: boolean;
  playerPalette: CharacterPalette;
  aiPalette: CharacterPalette;
}>();

const playerPalette = computed(() => props.playerPalette);
const aiPalette = computed(() => props.aiPalette);

// Facing sign: +1 = faces world +Z (baseRot 0), -1 = faces world -Z (baseRot PI).
// Player faces -Z on host (facing=-1), +Z on guest (facing=+1).
// AI is always the opposite of player.
const playerFacing = computed(() => (props.flipView ? 1 : -1));
const aiFacing = computed(() => -playerFacing.value);

// Base rotation from facing: +1 → 0 (faces +Z), -1 → PI (faces -Z)
const baseRotOf = (f: number) => (f > 0 ? 0 : Math.PI);
const playerBaseRot = computed(() => baseRotOf(playerFacing.value));
const aiBaseRot = computed(() => baseRotOf(aiFacing.value));

// Animation tuning constants
const ANIM = {
  BODY_TURN_FACTOR: 0.6,
  LEAN_FACTOR: 0.4,
  PITCH_FACTOR: 0.3,
  FREE_ARM_FACTOR: 0.7,
  SWING_AMPLITUDE: 0.6,
  WALK_SPEED_BASE: 6,
  WALK_SPEED_GAIN: 8,
  MOVE_THRESHOLD: 0.08,
  HEAD_HEIGHT: 0.68,
  PADDLE_Y: 0.22,
  HANDLE_X: 0.15,
  HANDLE_Z: 0.22,
  BALL_HANDLE_X: 0.1,
  BALL_HANDLE_Z: 0.06,
  PADDLE_X_CLAMP: 0.2,
  PADDLE_Z_MIN: 0.2,
  PADDLE_Z_MAX: 0.45,
  PADDLE_Z_ABS_MAX: 0.5,
  CENTER_PUSH: 0.08,
  SWING_TILT_X: 0.52,
  SWING_TILT_Z: 0.26,
  SHOULDER_X: 0.22,
  SHOULDER_Y: 0.38,
  K_BODY: 6,
  K_LEAN: 8,
  K_LIMB: 12,
  K_HEAD: 8,
  K_PADDLE: 8,
  K_ARM: 10,
  K_DAMP: 8,
} as const;

const playerRef = ref();
const aiRef = ref();
const ballRef = ref();
const shadowRef = ref();
const playerShadowRef = ref();
const aiShadowRef = ref();
const bounceMarkerRef = ref();
const cameraRef = ref();

const COURT_LENGTH = 13.41;

// Camera Z position depends on flipView (guest sees from opposite side)
const camZ = computed(() =>
  props.flipView ? -(COURT_LENGTH / 2 + 10) : COURT_LENGTH / 2 + 10,
);

// Initial camera position (used for first render, updated reactively)
const initialCamPos: [number, number, number] = [0, 6, camZ.value];

// Smooth follow look target — shifted toward AI to see more of their side
const camLookTarget = new THREE.Vector3(0, 0, props.flipView ? -3 : 3);

// When flipView changes, snap camera and character rotations to new perspective
watch(
  () => props.flipView,
  (flipped) => {
    if (cameraRef.value) {
      cameraRef.value.position.set(
        0,
        6,
        flipped ? -(COURT_LENGTH / 2 + 10) : COURT_LENGTH / 2 + 10,
      );
    }
    camLookTarget.set(0, 0, flipped ? -3 : 3);
    if (playerRef.value?.groupRef) {
      playerRef.value.groupRef.rotation.y = baseRotOf(flipped ? 1 : -1);
    }
    if (aiRef.value?.groupRef) {
      aiRef.value.groupRef.rotation.y = baseRotOf(flipped ? -1 : 1);
    }
  },
);

const { onBeforeRender } = useLoop();

let lastTime = 0;

// Per-character animation state (walk cycle, smoothing, stable angle)
interface CharAnimState {
  walkPhase: number;
  animMagSmooth: number;
  moveAngleStable: number;
}
const playerAnim: CharAnimState = {
  walkPhase: 0,
  animMagSmooth: 0,
  moveAngleStable: 0,
};
const aiAnim: CharAnimState = {
  walkPhase: 0,
  animMagSmooth: 0,
  moveAngleStable: 0,
};

// Bounce marker smoothing state (render-side interpolation)
const markerPos = new THREE.Vector3();
const markerTarget = new THREE.Vector3();
let markerOpacity = 0;
let markerMissTime = 0;
let markerHasTarget = false;

/*
 * Shared character animation — handles body yaw/lean/pitch, walk cycle,
 * head tracking, pupils, paddle position/rotation, and paddle-arm.
 *
 * All view-dependent logic derives from `facing` (+1 = faces +Z, -1 = faces -Z).
 * Never write flipView conditionals below — derive from facing.
 */
interface CharacterHandle {
  groupRef?: {
    position: { set: (x: number, y: number, z: number) => void };
    rotation: { y: number; z: number; x: number };
  };
  paddleRef?: {
    position: {
      set: (x: number, y: number, z: number) => void;
      x: number;
      z: number;
    };
    rotation: { set: (x: number, y: number, z: number) => void };
  };
  leftLegRef?: { rotation: { x: number; z: number } };
  rightLegRef?: { rotation: { x: number; z: number; y: number } };
  leftArmRef?: { rotation: { x: number; z: number } };
  rightArmRef?: { rotation: { x: number; y: number; z: number } };
  headRef?: { rotation: { y: number; x: number } };
  pupilPositions?: { value: Record<string, number> };
}

interface CharacterUpdate {
  facing: number;
  pos: { x: number; z: number };
  moveDir: number;
  moveZ: number;
  swing: number;
  swingDir: number;
  reach: number;
  paddleAngle: number;
  ballPos: { x: number; y: number; z: number };
  opponentPos: { x: number; z: number };
  servePending: boolean;
  anim: CharAnimState;
  dt: number;
}

function updateCharacter(
  char: CharacterHandle | undefined,
  u: CharacterUpdate,
) {
  if (!char?.groupRef) return;
  const {
    facing: f,
    pos,
    moveDir,
    moveZ,
    swing,
    swingDir,
    reach,
    paddleAngle,
    ballPos,
    opponentPos,
    servePending,
    anim,
    dt,
  } = u;

  // --- Body position + rotation ---
  char.groupRef.position.set(pos.x, 0, pos.z);
  const baseRot = baseRotOf(f);
  const moveAngle = Math.atan2(f * moveDir, f * moveZ);
  const moveMagBody = Math.sqrt(moveDir * moveDir + moveZ * moveZ);
  let targetBodyY: number;
  if (moveMagBody < 0.05) {
    targetBodyY = baseRot;
  } else {
    targetBodyY = baseRot + moveAngle * ANIM.BODY_TURN_FACTOR;
  }
  const targetLean = f * moveDir * ANIM.LEAN_FACTOR;
  const targetPitch = f * moveZ * ANIM.PITCH_FACTOR;
  const k = Math.min(1, dt * ANIM.K_BODY);
  const kLean = Math.min(1, dt * ANIM.K_LEAN);
  char.groupRef.rotation.y += (targetBodyY - char.groupRef.rotation.y) * k;
  char.groupRef.rotation.z += (targetLean - char.groupRef.rotation.z) * kLean;
  char.groupRef.rotation.x += (targetPitch - char.groupRef.rotation.x) * kLean;

  // --- Walk cycle (legs + free arm) ---
  const moveMag = Math.min(1, moveMagBody);
  anim.animMagSmooth = THREE.MathUtils.damp(
    anim.animMagSmooth,
    moveMag,
    ANIM.K_DAMP,
    dt,
  );
  const animMag = anim.animMagSmooth;
  if (moveMag > ANIM.MOVE_THRESHOLD) {
    anim.moveAngleStable = moveAngle;
  }
  const stableAngle = anim.moveAngleStable;
  const walkSpeed = ANIM.WALK_SPEED_BASE + animMag * ANIM.WALK_SPEED_GAIN;
  anim.walkPhase += dt * walkSpeed;
  const swingBase = Math.sin(anim.walkPhase) * ANIM.SWING_AMPLITUDE * animMag;
  const swingX = swingBase * Math.cos(stableAngle);
  const swingZ = swingBase * Math.sin(stableAngle);
  const kLimb = Math.min(1, dt * ANIM.K_LIMB);
  if (char.leftLegRef) {
    char.leftLegRef.rotation.x += (swingX - char.leftLegRef.rotation.x) * kLimb;
    char.leftLegRef.rotation.z += (swingZ - char.leftLegRef.rotation.z) * kLimb;
  }
  if (char.rightLegRef) {
    char.rightLegRef.rotation.x +=
      (-swingX - char.rightLegRef.rotation.x) * kLimb;
    char.rightLegRef.rotation.z +=
      (-swingZ - char.rightLegRef.rotation.z) * kLimb;
  }
  if (char.leftArmRef) {
    char.leftArmRef.rotation.x +=
      (-swingX * ANIM.FREE_ARM_FACTOR - char.leftArmRef.rotation.x) * kLimb;
    char.leftArmRef.rotation.z +=
      (-swingZ * ANIM.FREE_ARM_FACTOR - char.leftArmRef.rotation.z) * kLimb;
  }

  // --- Head tracking (opponent during serve, ball during rally) ---
  if (char.headRef) {
    const dxTarget = servePending ? opponentPos.x - pos.x : ballPos.x - pos.x;
    const dzTarget = servePending ? opponentPos.z - pos.z : ballPos.z - pos.z;
    const targetDist = Math.sqrt(dxTarget * dxTarget + dzTarget * dzTarget);
    const worldHeadYaw = Math.atan2(dxTarget, dzTarget);
    const bodyY = char.groupRef.rotation.y;
    const targetHeadYaw = worldHeadYaw - bodyY;
    let normYaw = targetHeadYaw;
    while (normYaw > Math.PI) normYaw -= 2 * Math.PI;
    while (normYaw < -Math.PI) normYaw += 2 * Math.PI;
    const clampedHeadYaw = Math.max(
      -Math.PI / 3,
      Math.min(Math.PI / 3, normYaw),
    );
    const dyTarget = servePending ? 0 : ballPos.y - ANIM.HEAD_HEIGHT;
    const targetHeadPitch = Math.atan2(dyTarget, Math.max(targetDist, 0.1));
    const clampedHeadPitch = Math.max(
      -Math.PI / 4,
      Math.min((Math.PI * 5) / 12, targetHeadPitch),
    );
    const kHead = Math.min(1, dt * ANIM.K_HEAD);
    char.headRef.rotation.y +=
      (clampedHeadYaw - char.headRef.rotation.y) * kHead;
    char.headRef.rotation.x +=
      (-f * clampedHeadPitch - char.headRef.rotation.x) * kHead;
  }

  // --- Pupils track ball ---
  const pupils = char.pupilPositions?.value;
  if (pupils) {
    const dxBall = ballPos.x - pos.x;
    const dzBall = ballPos.z - pos.z;
    const ballDist = Math.sqrt(dxBall * dxBall + dzBall * dzBall);
    const nx = ballDist > 0 ? dxBall / ballDist : 0;
    const nz = ballDist > 0 ? dzBall / ballDist : 0;
    const dy = (ballPos.y - ANIM.HEAD_HEIGHT) / Math.max(ballDist, 0.5);
    const pupilOffX = nx * 0.03;
    const pupilOffY = Math.max(-0.025, Math.min(0.025, dy * 0.03));
    const pupilOffZ = f * nz * 0.02;
    pupils.lx = -0.15 + pupilOffX;
    pupils.ly = 0.03 + pupilOffY;
    pupils.lz = 0.37 + pupilOffZ;
    pupils.rx = 0.15 + pupilOffX;
    pupils.ry = 0.03 + pupilOffY;
    pupils.rz = 0.37 + pupilOffZ;
    pupils.lsx = -0.13 + pupilOffX;
    pupils.lsy = 0.06 + pupilOffY;
    pupils.lsz = 0.4 + pupilOffZ;
    pupils.rsx = 0.17 + pupilOffX;
    pupils.rsy = 0.06 + pupilOffY;
    pupils.rsz = 0.4 + pupilOffZ;
  }

  // --- Paddle position + rotation ---
  if (char.paddleRef) {
    const handleX = moveDir < -0.1 ? -ANIM.HANDLE_X : ANIM.HANDLE_X;
    const ballHandleX = Math.sin(paddleAngle) * ANIM.BALL_HANDLE_X;
    const ballHandleZ = f * Math.cos(paddleAngle) * ANIM.BALL_HANDLE_Z;
    const targetX = (handleX * (1 - reach) + ballHandleX * reach) * -f;
    const targetZ = ANIM.HANDLE_Z * (1 - reach) + ballHandleZ * reach;
    const curX = char.paddleRef.position.x;
    let newPaddleX = curX + (targetX - curX) * Math.min(1, dt * ANIM.K_PADDLE);
    const curZ = char.paddleRef.position.z;
    let newPaddleZ = curZ + (targetZ - curZ) * Math.min(1, dt * ANIM.K_PADDLE);
    newPaddleX = Math.max(
      -ANIM.PADDLE_X_CLAMP,
      Math.min(ANIM.PADDLE_X_CLAMP, newPaddleX),
    );
    newPaddleZ = Math.max(
      ANIM.PADDLE_Z_MIN,
      Math.min(ANIM.PADDLE_Z_MAX, newPaddleZ),
    );
    const centerProximity =
      1 - Math.min(1, Math.abs(newPaddleX) / ANIM.PADDLE_X_CLAMP);
    newPaddleZ += centerProximity * ANIM.CENTER_PUSH;
    newPaddleZ = Math.min(ANIM.PADDLE_Z_ABS_MAX, newPaddleZ);
    char.paddleRef.position.set(newPaddleX, ANIM.PADDLE_Y, newPaddleZ);

    // Paddle yaw faces the ball
    const dxBall = ballPos.x - pos.x;
    const dzBall = ballPos.z - pos.z;
    const paddleYaw = Math.atan2(dxBall, f * dzBall) - char.groupRef.rotation.y;
    char.paddleRef.rotation.set(
      -swing * ANIM.SWING_TILT_X * swingDir,
      paddleYaw,
      -swing * ANIM.SWING_TILT_Z * swingDir,
    );

    // Paddle-side arm points toward paddle
    if (char.rightArmRef) {
      const shoulderX = -f * ANIM.SHOULDER_X;
      const shoulderY = ANIM.SHOULDER_Y;
      const shoulderZ = 0;
      const dx = newPaddleX - shoulderX;
      const dy = ANIM.PADDLE_Y - shoulderY;
      const dz = newPaddleZ - shoulderZ;
      const armYaw = Math.atan2(dx, dz);
      const armPitch = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz));
      char.rightArmRef.rotation.y +=
        (armYaw - char.rightArmRef.rotation.y) * Math.min(1, dt * ANIM.K_ARM);
      char.rightArmRef.rotation.x +=
        (armPitch - char.rightArmRef.rotation.x) * Math.min(1, dt * ANIM.K_ARM);
    }
  }
}

onMounted(() => {
  // Set initial base rotations from facing
  if (playerRef.value?.groupRef) {
    playerRef.value.groupRef.rotation.y = playerBaseRot.value;
  }
  if (aiRef.value?.groupRef) {
    aiRef.value.groupRef.rotation.y = aiBaseRot.value;
  }
  onBeforeRender(({ elapsed }) => {
    // Run game physics step first (merged from separate RAF)
    props.step(elapsed);
    // dt for animation interpolation
    const dt = lastTime > 0 ? Math.min(elapsed - lastTime, 0.05) : 0.016;
    lastTime = elapsed;

    const r = props.refs;

    // Animate both characters via shared helper — all flipView logic
    // is captured by the facing sign, no conditionals below this point.
    updateCharacter(playerRef.value, {
      facing: playerFacing.value,
      pos: r.playerPos,
      moveDir: r.playerMoveDir,
      moveZ: r.playerMoveZ,
      swing: r.playerSwing,
      swingDir: r.playerSwingDir,
      reach: r.playerReach,
      paddleAngle: r.playerPaddleAngle,
      ballPos: r.ballPos,
      opponentPos: r.aiPos,
      servePending: r.servePending,
      anim: playerAnim,
      dt,
    });

    updateCharacter(aiRef.value, {
      facing: aiFacing.value,
      pos: r.aiPos,
      moveDir: r.aiMoveDir,
      moveZ: r.aiMoveZ,
      swing: r.aiSwing,
      swingDir: r.aiSwingDir,
      reach: r.aiReach,
      paddleAngle: r.aiPaddleAngle,
      ballPos: r.ballPos,
      opponentPos: r.playerPos,
      servePending: r.servePending,
      anim: aiAnim,
      dt,
    });

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
      const flipped = props.flipView;
      const midX = r.playerPos.x * 0.6 + r.aiPos.x * 0.2;
      cam.position.x += (midX - cam.position.x) * Math.min(1, dt * 4);
      // Keep camera Z fixed at the correct side
      cam.position.z = camZ.value;
      camLookTarget.x = r.playerPos.x * 0.35 + r.aiPos.x * 0.15;
      camLookTarget.z = flipped
        ? -3 + r.playerPos.z * 0.1 - r.aiPos.z * 0.05
        : 3 + r.playerPos.z * 0.1 - r.aiPos.z * 0.05;
      cam.lookAt(camLookTarget);
    }
  });
});
</script>
