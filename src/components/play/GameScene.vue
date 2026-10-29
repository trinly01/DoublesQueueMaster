<template>
  <TresCanvas clear-color="#667eea" :dpr="[1, 2]">
    <!-- Lighting -->
    <TresAmbientLight :intensity="0.6" />
    <TresDirectionalLight :position="[5, 10, 5] as any" :intensity="1.2" />

    <!-- Ground (green area around court) -->
    <TresMesh :rotation="[-Math.PI / 2, 0, 0]" :position="[0, -0.05, 0] as any">
      <TresPlaneGeometry :args="[30, 40]" />
      <TresMeshLambertMaterial color="#5b7c99" />
    </TresMesh>

    <!-- Court surface -->
    <TresMesh :rotation="[-Math.PI / 2, 0, 0]" :position="[0, 0, 0] as any">
      <TresPlaneGeometry :args="[COURT_WIDTH, COURT_LENGTH]" />
      <TresMeshLambertMaterial color="#764ba2" />
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

    <!-- Kitchen zone tint (player side) — lightened brand periwinkle -->
    <TresMesh
      :rotation="[-Math.PI / 2, 0, 0]"
      :position="[0, 0.01, KITCHEN_DEPTH / 2] as any"
    >
      <TresPlaneGeometry :args="[COURT_WIDTH, KITCHEN_DEPTH]" />
      <TresMeshLambertMaterial color="#8b9cf5" />
    </TresMesh>
    <!-- Kitchen zone tint (AI side) -->
    <TresMesh
      :rotation="[-Math.PI / 2, 0, 0]"
      :position="[0, 0.01, -KITCHEN_DEPTH / 2] as any"
    >
      <TresPlaneGeometry :args="[COURT_WIDTH, KITCHEN_DEPTH]" />
      <TresMeshLambertMaterial color="#8b9cf5" />
    </TresMesh>

    <!-- Painted "dinkmatch.club" text in each kitchen, readable from its
         own baseline like real court decals -->
    <TresMesh
      :rotation="[-Math.PI / 2, 0, 0]"
      :position="[0, 0.015, KITCHEN_DEPTH / 2] as any"
    >
      <TresPlaneGeometry :args="[5.2, 1.3]" />
      <TresMeshBasicMaterial
        :map="kitchenTextTexture"
        :transparent="true"
        :opacity="0.75"
      />
    </TresMesh>
    <TresMesh
      :rotation="[-Math.PI / 2, 0, Math.PI]"
      :position="[0, 0.015, -KITCHEN_DEPTH / 2] as any"
    >
      <TresPlaneGeometry :args="[5.2, 1.3]" />
      <TresMeshBasicMaterial
        :map="kitchenTextTexture"
        :transparent="true"
        :opacity="0.3"
      />
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

    <!-- Net — official spec: 34in at center (NET_HEIGHT), 36in at posts,
         posts stand ~1ft outside the sidelines (22ft apart) -->
    <TresMesh :position="[0, NET_HEIGHT / 2, 0] as any">
      <TresBoxGeometry :args="[NET_SPAN, NET_HEIGHT, 0.03]" />
      <TresMeshLambertMaterial color="#14142a" :opacity="0.5" transparent />
    </TresMesh>
    <!-- Net posts (1ft outside each sideline) -->
    <TresMesh :position="[-POST_X, POST_HEIGHT / 2, 0] as any">
      <TresCylinderGeometry :args="[0.04, 0.04, POST_HEIGHT, 8]" />
      <TresMeshLambertMaterial color="#e0e0e0" />
    </TresMesh>
    <TresMesh :position="[POST_X, POST_HEIGHT / 2, 0] as any">
      <TresCylinderGeometry :args="[0.04, 0.04, POST_HEIGHT, 8]" />
      <TresMeshLambertMaterial color="#e0e0e0" />
    </TresMesh>

    <!-- Transparent walls at net (prevent crossing within court) -->
    <TresMesh :position="[0, NET_HEIGHT / 2, 0] as any">
      <TresBoxGeometry :args="[NET_SPAN, NET_HEIGHT, 0.02]" />
      <TresMeshBasicMaterial
        color="#667eea"
        :opacity="0.08"
        transparent
        :side="2"
      />
    </TresMesh>
    <!-- Wall top edge highlight -->
    <TresMesh :position="[0, NET_HEIGHT, 0] as any">
      <TresBoxGeometry :args="[NET_SPAN, 0.03, 0.03]" />
      <TresMeshBasicMaterial color="#667eea" :opacity="0.3" transparent />
    </TresMesh>

    <!-- Dynamic actors (player, AI, ball) — updated per-frame via useRenderLoop -->
    <GameActors
      :refs="refs"
      :step="step"
      :flip-view="flipView"
      :player-palette="playerPalette"
      :ai-palette="aiPalette"
    />
  </TresCanvas>
</template>

<script setup lang="ts">
import { TresCanvas } from '@tresjs/core';
import * as THREE from 'three';
import logoUrl from 'src/assets/queue master logo.png';
import type { GameRefs } from 'src/composables/useGameEngine';
import type { CharacterPalette } from 'src/composables/useRandomPalette';
import GameActors from 'components/play/GameActors.vue';

defineProps<{
  refs: GameRefs;
  step: (time: number) => void;
  flipView?: boolean;
  playerPalette: CharacterPalette;
  aiPalette: CharacterPalette;
}>();

const COURT_LENGTH = 13.41;
const COURT_WIDTH = 6.1;
const NET_HEIGHT = 0.86; // 34in at center
const NET_SPAN = 6.71; // 22ft post-to-post
const POST_X = COURT_WIDTH / 2 + 0.305; // ~1ft outside the sideline
const POST_HEIGHT = 0.92; // ~36in at the posts
const KITCHEN_DEPTH = 2.13;

// Painted-court decal: logo + text composed on a canvas → texture
function makeCourtDecalTexture(text: string, imgSrc: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;

  const paint = (img?: HTMLImageElement) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';

    // Logo box on the left (square, fit height)
    let logoW = 0;
    const logoH = 170;
    const gap = 36;
    if (img) {
      logoW = (img.width / img.height) * logoH;
    }

    // Fit the text into what's left after logo + gaps
    const textZone = canvas.width * 0.9 - logoW - (img ? gap : 0);
    ctx.font = '700 100px Arial, sans-serif';
    const fit = textZone / ctx.measureText(text).width;
    ctx.font = `700 ${Math.floor(Math.min(fit, 1) * 100)}px Arial, sans-serif`;
    const textW = ctx.measureText(text).width;

    // Center the logo+text group as one unit
    const totalW = logoW + (img ? gap : 0) + textW;
    let x = (canvas.width - totalW) / 2;
    if (img) {
      ctx.drawImage(img, x, (canvas.height - logoH) / 2, logoW, logoH);
      x += logoW + gap;
    }
    // Logo stays fully opaque for its real colors; the text gets the
    // faded painted-court look baked into its own alpha instead.
    ctx.globalAlpha = 0.55;
    ctx.textAlign = 'left';
    ctx.fillText(text, x, canvas.height / 2);
    ctx.globalAlpha = 1;
    tex.needsUpdate = true;
  };
  paint();

  const img = new Image();
  img.onload = () => paint(img);
  img.src = imgSrc;
  return tex;
}
const kitchenTextTexture = makeCourtDecalTexture('dinkmatch.club', logoUrl);
</script>
