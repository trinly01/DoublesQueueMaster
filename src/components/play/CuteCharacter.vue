<template>
  <TresGroup ref="groupRef">
    <!-- Body (small capsule — chibi proportions) -->
    <TresMesh :position="[0, 0.38, 0] as any" cast-shadow>
      <TresCapsuleGeometry :args="[0.18, 0.1, 6, 12]" />
      <TresMeshStandardMaterial :color="bodyColor" :roughness="0.7" />
    </TresMesh>

    <!-- Skirt for girls (cone shape over legs) -->
    <TresMesh
      v-if="gender === 'girl'"
      :position="[0, 0.22, 0] as any"
      cast-shadow
    >
      <TresCylinderGeometry :args="[0.14, 0.26, 0.18, 12]" />
      <TresMeshStandardMaterial :color="pantsColor" :roughness="0.8" />
    </TresMesh>

    <!-- Left leg group (pants + shoe + heel, animates together) -->
    <TresGroup ref="leftLegRef" :position="[-0.09, 0.22, 0] as any">
      <!-- Pant leg (hidden for girls, skirt covers it) -->
      <TresMesh
        v-if="gender === 'boy'"
        :position="[0, -0.06, 0] as any"
        cast-shadow
      >
        <TresCapsuleGeometry :args="[0.1, 0.06, 4, 8]" />
        <TresMeshStandardMaterial :color="pantsColor" :roughness="0.8" />
      </TresMesh>
      <!-- Bare leg for girls (skin tone shows below skirt) -->
      <TresMesh
        v-if="gender === 'girl'"
        :position="[0, -0.06, 0] as any"
        cast-shadow
      >
        <TresCapsuleGeometry :args="[0.08, 0.06, 4, 8]" />
        <TresMeshStandardMaterial :color="headColor" :roughness="0.8" />
      </TresMesh>
      <!-- Shoe -->
      <TresMesh :position="[0, -0.19, 0.08] as any" cast-shadow>
        <TresSphereGeometry :args="[0.11, 6, 6]" />
        <TresMeshStandardMaterial :color="shoeColor" :roughness="0.8" />
      </TresMesh>
      <!-- Shoe heel volume -->
      <TresMesh
        :position="[0, -0.17, -0.02] as any"
        :scale="[1, 0.6, 1.2] as any"
        cast-shadow
      >
        <TresSphereGeometry :args="[0.1, 6, 6]" />
        <TresMeshStandardMaterial :color="shoeColor" :roughness="0.8" />
      </TresMesh>
    </TresGroup>

    <!-- Right leg group (pants + shoe + heel, animates together) -->
    <TresGroup ref="rightLegRef" :position="[0.09, 0.22, 0] as any">
      <!-- Pant leg (hidden for girls, skirt covers it) -->
      <TresMesh
        v-if="gender === 'boy'"
        :position="[0, -0.06, 0] as any"
        cast-shadow
      >
        <TresCapsuleGeometry :args="[0.1, 0.06, 4, 8]" />
        <TresMeshStandardMaterial :color="pantsColor" :roughness="0.8" />
      </TresMesh>
      <!-- Bare leg for girls -->
      <TresMesh
        v-if="gender === 'girl'"
        :position="[0, -0.06, 0] as any"
        cast-shadow
      >
        <TresCapsuleGeometry :args="[0.08, 0.06, 4, 8]" />
        <TresMeshStandardMaterial :color="headColor" :roughness="0.8" />
      </TresMesh>
      <!-- Shoe -->
      <TresMesh :position="[0, -0.19, 0.08] as any" cast-shadow>
        <TresSphereGeometry :args="[0.11, 6, 6]" />
        <TresMeshStandardMaterial :color="shoeColor" :roughness="0.8" />
      </TresMesh>
      <!-- Shoe heel volume -->
      <TresMesh
        :position="[0, -0.17, -0.02] as any"
        :scale="[1, 0.6, 1.2] as any"
        cast-shadow
      >
        <TresSphereGeometry :args="[0.1, 6, 6]" />
        <TresMeshStandardMaterial :color="shoeColor" :roughness="0.8" />
      </TresMesh>
    </TresGroup>

    <!-- Left arm group (arm + hand together) -->
    <TresGroup ref="leftArmRef" :position="[-0.22, 0.38, 0] as any">
      <TresMesh :position="[0, -0.08, 0] as any" cast-shadow>
        <TresCapsuleGeometry :args="[0.05, 0.1, 4, 8]" />
        <TresMeshStandardMaterial :color="headColor" :roughness="0.7" />
      </TresMesh>
      <!-- Left hand -->
      <TresMesh :position="[0, -0.16, 0.02] as any" cast-shadow>
        <TresSphereGeometry :args="[0.05, 6, 6]" />
        <TresMeshStandardMaterial :color="headColor" :roughness="0.6" />
      </TresMesh>
    </TresGroup>

    <!-- Right arm group (arm + hand together, follows paddle) -->
    <TresGroup ref="rightArmRef" :position="[0.22, 0.38, 0] as any">
      <TresMesh :position="[0, -0.08, 0] as any" cast-shadow>
        <TresCapsuleGeometry :args="[0.05, 0.1, 4, 8]" />
        <TresMeshStandardMaterial :color="headColor" :roughness="0.7" />
      </TresMesh>
      <!-- Right hand (holds paddle handle) -->
      <TresMesh
        ref="rightHandRef"
        :position="[0, -0.16, 0.02] as any"
        cast-shadow
      >
        <TresSphereGeometry :args="[0.05, 6, 6]" />
        <TresMeshStandardMaterial :color="headColor" :roughness="0.6" />
      </TresMesh>
    </TresGroup>

    <!-- Head group (rotates toward movement direction) -->
    <TresGroup ref="headRef" :position="[0, 0.68, 0] as any">
      <!-- Head (big sphere — chibi style) -->
      <TresMesh cast-shadow>
        <TresSphereGeometry :args="[0.38, 14, 14]" />
        <TresMeshStandardMaterial :color="headColor" :roughness="0.5" />
      </TresMesh>

      <!-- Ears -->
      <TresMesh
        :position="[-0.38, -0.02, 0] as any"
        :scale="[0.4, 0.7, 0.3] as any"
        cast-shadow
      >
        <TresSphereGeometry :args="[0.08, 6, 6]" />
        <TresMeshStandardMaterial :color="headColor" :roughness="0.5" />
      </TresMesh>
      <TresMesh
        :position="[0.38, -0.02, 0] as any"
        :scale="[0.4, 0.7, 0.3] as any"
        cast-shadow
      >
        <TresSphereGeometry :args="[0.08, 6, 6]" />
        <TresMeshStandardMaterial :color="headColor" :roughness="0.5" />
      </TresMesh>

      <!-- Hair: top cap (extends further down for girls to cover back of head) -->
      <TresMesh :position="[0, 0.2, -0.03] as any" cast-shadow>
        <TresSphereGeometry
          :args="[
            0.4,
            12,
            8,
            0,
            Math.PI * 2,
            0,
            gender === 'girl' ? Math.PI * 0.65 : Math.PI * 0.58,
          ]"
        />
        <TresMeshStandardMaterial :color="hairColor" :roughness="0.6" />
      </TresMesh>
      <!-- Hair fringe / bangs -->
      <TresMesh
        :position="[0, 0.14, 0.26] as any"
        :rotation="[0.35, 0, 0]"
        cast-shadow
      >
        <TresSphereGeometry
          :args="[0.34, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.3]"
        />
        <TresMeshStandardMaterial :color="hairColor" :roughness="0.6" />
      </TresMesh>
      <!-- Hair side tufts (positioned behind ears, slightly higher) -->
      <TresMesh
        v-if="gender === 'boy'"
        :position="[-0.32, 0.06, -0.02] as any"
        :scale="[0.5, 0.8, 0.6] as any"
        cast-shadow
      >
        <TresSphereGeometry :args="[0.12, 6, 6]" />
        <TresMeshStandardMaterial :color="hairColor" :roughness="0.6" />
      </TresMesh>
      <TresMesh
        v-if="gender === 'boy'"
        :position="[0.32, 0.06, -0.02] as any"
        :scale="[0.5, 0.8, 0.6] as any"
        cast-shadow
      >
        <TresSphereGeometry :args="[0.12, 6, 6]" />
        <TresMeshStandardMaterial :color="hairColor" :roughness="0.6" />
      </TresMesh>
      <!-- Boy back hair removed — top cap now extends further down to cover back -->
      <!-- Long hair for girls: back panel covering back of head to neck (below cap) -->
      <TresMesh
        v-if="gender === 'girl'"
        :position="[0, -0.08, -0.26] as any"
        :scale="[1.05, 0.6, 0.6] as any"
        cast-shadow
      >
        <TresSphereGeometry :args="[0.36, 12, 12]" />
        <TresMeshStandardMaterial :color="hairColor" :roughness="0.6" />
      </TresMesh>
      <!-- Long hair for girls: left side panel covering side of head to neck -->
      <TresMesh
        v-if="gender === 'girl'"
        :position="[-0.38, -0.05, -0.05] as any"
        :scale="[0.45, 1.1, 0.85] as any"
        cast-shadow
      >
        <TresSphereGeometry :args="[0.14, 8, 8]" />
        <TresMeshStandardMaterial :color="hairColor" :roughness="0.6" />
      </TresMesh>
      <!-- Long hair for girls: right side panel covering side of head to neck -->
      <TresMesh
        v-if="gender === 'girl'"
        :position="[0.38, -0.05, -0.05] as any"
        :scale="[0.45, 1.1, 0.85] as any"
        cast-shadow
      >
        <TresSphereGeometry :args="[0.14, 8, 8]" />
        <TresMeshStandardMaterial :color="hairColor" :roughness="0.6" />
      </TresMesh>
      <!-- Little ahoge (cute cowlick strand) -->
      <TresMesh
        :position="[0.08, 0.44, 0.05] as any"
        :rotation="[0.4, 0, 0.3]"
        :scale="[0.4, 1.5, 0.4] as any"
        cast-shadow
      >
        <TresCapsuleGeometry :args="[0.04, 0.1, 4, 6]" />
        <TresMeshStandardMaterial :color="hairColor" :roughness="0.6" />
      </TresMesh>

      <!-- Cap crown (hemisphere, bigger to cover hair) -->
      <TresMesh v-if="hasHat" :position="[0, 0.24, -0.02] as any" cast-shadow>
        <TresSphereGeometry
          :args="[0.42, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55]"
        />
        <TresMeshStandardMaterial :color="hatColor" :roughness="0.6" />
      </TresMesh>
      <!-- Cap brim / visor (flat, extends forward) -->
      <TresMesh
        v-if="hasHat"
        :position="[0, 0.14, 0.32] as any"
        :rotation="[-0.15, 0, 0]"
        :scale="[1.3, 0.12, 1] as any"
        cast-shadow
      >
        <TresCylinderGeometry
          :args="[0.18, 0.18, 0.22, 16, 1, false, 0, Math.PI]"
        />
        <TresMeshStandardMaterial
          :color="hatColor"
          :roughness="0.6"
          :side="2"
        />
      </TresMesh>
      <!-- Cap button on top -->
      <TresMesh v-if="hasHat" :position="[0, 0.46, 0] as any" cast-shadow>
        <TresSphereGeometry :args="[0.04, 6, 6]" />
        <TresMeshStandardMaterial :color="hatColor" :roughness="0.7" />
      </TresMesh>

      <!-- Rosy cheeks -->
      <TresMesh :position="[-0.22, -0.06, 0.3] as any">
        <TresCircleGeometry :args="[0.06, 8]" />
        <TresMeshBasicMaterial color="#ff9999" :opacity="0.5" transparent />
      </TresMesh>
      <TresMesh :position="[0.22, -0.06, 0.3] as any">
        <TresCircleGeometry :args="[0.06, 8]" />
        <TresMeshBasicMaterial color="#ff9999" :opacity="0.5" transparent />
      </TresMesh>

      <!-- Big anime eyes (white sclera, oversized, tall oval) -->
      <TresMesh
        :position="[-0.15, 0.03, 0.3] as any"
        :scale="[1, 1.4, 0.6] as any"
      >
        <TresSphereGeometry :args="[0.1, 8, 8]" />
        <TresMeshStandardMaterial color="#ffffff" />
      </TresMesh>
      <TresMesh
        :position="[0.15, 0.03, 0.3] as any"
        :scale="[1, 1.4, 0.6] as any"
      >
        <TresSphereGeometry :args="[0.1, 8, 8]" />
        <TresMeshStandardMaterial color="#ffffff" />
      </TresMesh>
      <!-- Big anime pupils (dark, oversized) -->
      <TresMesh
        ref="leftPupilRef"
        :position="
          [pupilPositions.lx, pupilPositions.ly, pupilPositions.lz] as any
        "
        :scale="[1, 1.3, 0.5] as any"
      >
        <TresSphereGeometry :args="[0.06, 8, 8]" />
        <TresMeshStandardMaterial color="#1a1a3a" />
      </TresMesh>
      <TresMesh
        ref="rightPupilRef"
        :position="
          [pupilPositions.rx, pupilPositions.ry, pupilPositions.rz] as any
        "
        :scale="[1, 1.3, 0.5] as any"
      >
        <TresSphereGeometry :args="[0.06, 8, 8]" />
        <TresMeshStandardMaterial color="#1a1a3a" />
      </TresMesh>
      <!-- Eye shine (big cute glint, follows pupils) -->
      <TresMesh
        ref="leftShineRef"
        :position="
          [pupilPositions.lsx, pupilPositions.lsy, pupilPositions.lsz] as any
        "
      >
        <TresSphereGeometry :args="[0.025, 6, 6]" />
        <TresMeshBasicMaterial color="#ffffff" />
      </TresMesh>
      <TresMesh
        ref="rightShineRef"
        :position="
          [pupilPositions.rsx, pupilPositions.rsy, pupilPositions.rsz] as any
        "
      >
        <TresSphereGeometry :args="[0.025, 6, 6]" />
        <TresMeshBasicMaterial color="#ffffff" />
      </TresMesh>

      <!-- Cute smile -->
      <TresMesh :position="[0, -0.1, 0.34] as any" :rotation="[0.3, 0, 0]">
        <TresTorusGeometry :args="[0.07, 0.014, 6, 12, Math.PI]" />
        <TresMeshStandardMaterial color="#222222" />
      </TresMesh>
    </TresGroup>

    <!-- Paddle (hybrid shape: oval face on top, handle extends below) -->
    <TresGroup ref="paddleRef" :position="[0.28, 0.25, 0.05] as any">
      <!-- Handle: extends downward from face bottom to hand -->
      <TresMesh :position="[0, -0.15, 0] as any">
        <TresCylinderGeometry :args="[0.035, 0.035, 0.18, 8]" />
        <TresMeshStandardMaterial :color="paddleHandleColor" :roughness="0.6" />
      </TresMesh>
      <!-- Handle grip wrap -->
      <TresMesh :position="[0, -0.17, 0] as any">
        <TresCylinderGeometry :args="[0.038, 0.038, 0.12, 8]" />
        <TresMeshStandardMaterial :color="paddleGripColor" :roughness="0.5" />
      </TresMesh>
      <!-- Paddle face: oval on top, bottom meets handle top -->
      <TresMesh
        :position="[0, 0.22, 0] as any"
        :rotation="[Math.PI / 2, 0, 0] as any"
        :scale="[0.8, 1.1, 1] as any"
        cast-shadow
      >
        <TresCylinderGeometry :args="[0.26, 0.26, 0.03, 32]" />
        <TresMeshStandardMaterial :color="paddleColor" :roughness="0.4" />
      </TresMesh>
      <!-- Edge guard: hollow ring on paddle face edge, white border -->
      <TresMesh
        :position="[0, 0.22, 0.02] as any"
        :rotation="[0, 0, 0] as any"
        :scale="[0.8, 1.1, 1] as any"
      >
        <TresRingGeometry :args="[0.26, 0.29, 48]" />
        <TresMeshStandardMaterial
          :color="paddleEdgeColor"
          :roughness="0.3"
          :side="2"
        />
      </TresMesh>
    </TresGroup>
  </TresGroup>
</template>

<script setup lang="ts">
import { ref } from 'vue';

withDefaults(
  defineProps<{
    rotation?: number;
    bodyColor?: string;
    headColor?: string;
    paddleColor?: string;
    paddleHandleColor?: string;
    paddleGripColor?: string;
    paddleEdgeColor?: string;
    hairColor?: string;
    hatColor?: string;
    pantsColor?: string;
    shoeColor?: string;
    gender?: 'boy' | 'girl';
    hasHat?: boolean;
    swing?: number;
    paddleSide?: number; // 1 = right (AI), -1 = right of screen for player (rotated 180°)
  }>(),
  {
    rotation: 0,
    bodyColor: '#667eea',
    paddleColor: '#1a1a2e',
    paddleHandleColor: '#ff6b9d',
    paddleGripColor: '#c2185b',
    paddleEdgeColor: '#ffffff',
    headColor: '#FFD3B6',
    hairColor: '#3a2b1a',
    hatColor: '#ff6b6b',
    pantsColor: '#c0c8e0',
    shoeColor: '#333344',
    gender: 'boy',
    hasHat: true,
    swing: 0,
    paddleSide: 1,
  },
);

const groupRef = ref();
const paddleRef = ref();
const leftLegRef = ref();
const rightLegRef = ref();
const leftArmRef = ref();
const rightArmRef = ref();
const rightHandRef = ref();
const headRef = ref();
const leftPupilRef = ref();
const rightPupilRef = ref();
const leftShineRef = ref();
const rightShineRef = ref();

// Pupil positions (reactive so TresJS updates them)
const pupilPositions = ref({
  lx: -0.15,
  ly: 0.02,
  lz: 0.37,
  rx: 0.15,
  ry: 0.02,
  rz: 0.37,
  lsx: -0.13,
  lsy: 0.06,
  lsz: 0.4,
  rsx: 0.17,
  rsy: 0.06,
  rsz: 0.4,
});

defineExpose({
  groupRef,
  paddleRef,
  leftLegRef,
  rightLegRef,
  leftArmRef,
  rightArmRef,
  rightHandRef,
  headRef,
  pupilPositions,
  leftPupilRef,
  rightPupilRef,
  leftShineRef,
  rightShineRef,
});
</script>
