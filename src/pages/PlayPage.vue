<template>
  <div class="play-page">
    <!-- 3D Scene -->
    <div class="scene-container">
      <GameScene :refs="engine.refs" />
    </div>

    <!-- Top-left: Score (mobile: same row) -->
    <div class="top-left-row">
      <div v-if="engine.gameState.value !== 'menu'" class="score-pill">
        <span class="score-label score-you-label">
          <span
            v-if="
              engine.rules.value === 'authentic' &&
              engine.server.value === 'player'
            "
            class="server-dot"
            >●</span
          >YOU</span
        >
        <span class="score-num score-you-num">{{
          engine.playerScore.value
        }}</span>
        <span class="score-sep">—</span>
        <span class="score-num score-ai-num">{{ engine.aiScore.value }}</span>
        <span class="score-label score-ai-label"
          >AI<span
            v-if="
              engine.rules.value === 'authentic' && engine.server.value === 'ai'
            "
            class="server-dot"
            >●</span
          ></span
        >
      </div>
    </div>

    <!-- Point toast -->
    <div v-if="engine.gameState.value === 'point-scored'" class="point-toast">
      {{ engine.lastPointMsg.value }}
    </div>

    <!-- Serve hint (when player needs to serve) -->
    <div
      v-if="
        engine.servePending.value &&
        engine.server.value === 'player' &&
        engine.gameState.value === 'playing'
      "
      class="serve-hint-container"
    >
      <p class="serve-hint">
        Move to serve, serve
        {{ engine.playerScore.value % 2 === 0 ? 'RIGHT' : 'LEFT' }} court
      </p>
    </div>

    <!-- Exit button (top right, during menu and game-over) -->
    <div
      v-if="
        engine.gameState.value === 'menu' ||
        engine.gameState.value === 'game-over'
      "
      class="top-right-exit"
    >
      <q-btn flat round dense icon="close" color="white" @click="goBack">
        <q-tooltip anchor="center end" self="center start">Exit</q-tooltip>
      </q-btn>
    </div>

    <!-- Control buttons (top right, vertical, during play) -->
    <div
      v-if="
        engine.gameState.value === 'playing' ||
        engine.gameState.value === 'point-scored' ||
        engine.gameState.value === 'paused'
      "
      class="top-right-controls"
    >
      <q-btn flat round dense icon="close" color="white" @click="goBack">
        <q-tooltip anchor="center end" self="center start">Exit</q-tooltip>
      </q-btn>
      <q-btn
        flat
        round
        dense
        :icon="engine.sound.soundEnabled.value ? 'volume_up' : 'volume_off'"
        color="white"
        @click="engine.sound.toggleSound()"
      >
        <q-tooltip anchor="center end" self="center start">{{
          engine.sound.soundEnabled.value ? 'Mute SFX' : 'Enable SFX'
        }}</q-tooltip>
      </q-btn>
      <q-btn
        flat
        round
        dense
        :icon="engine.sound.musicEnabled.value ? 'music_note' : 'music_off'"
        color="white"
        @click="engine.sound.toggleMusic()"
      >
        <q-tooltip anchor="center end" self="center start">{{
          engine.sound.musicEnabled.value ? 'Mute Music' : 'Enable Music'
        }}</q-tooltip>
      </q-btn>
      <q-btn
        flat
        round
        dense
        :icon="engine.gameState.value === 'paused' ? 'play_arrow' : 'pause'"
        color="white"
        @click="
          engine.gameState.value === 'paused'
            ? engine.resumeGame()
            : engine.pauseGame()
        "
      >
        <q-tooltip anchor="center end" self="center start">{{
          engine.gameState.value === 'paused' ? 'Resume' : 'Pause'
        }}</q-tooltip>
      </q-btn>
    </div>

    <!-- Pause overlay -->
    <div v-if="engine.gameState.value === 'paused'" class="menu-overlay">
      <div class="menu-card">
        <h1 class="menu-title">Paused</h1>
        <q-btn
          label="Main Menu"
          color="white"
          text-color="grey-7"
          rounded
          size="md"
          class="play-btn"
          outline
          @click="engine.resetScore()"
        />
        <q-btn
          label="Resume"
          color="white"
          text-color="accent"
          unelevated
          rounded
          size="lg"
          class="play-btn"
          @click="engine.resumeGame()"
        />
      </div>
    </div>

    <!-- Menu overlay -->
    <div v-if="engine.gameState.value === 'menu'" class="menu-overlay">
      <div class="menu-card">
        <h1 class="menu-title">DinkMatch AI</h1>
        <p class="menu-subtitle">First to 11</p>

        <div class="difficulty-section">
          <p class="difficulty-label">AI Difficulty</p>
          <div class="difficulty-buttons">
            <q-btn
              v-for="d in difficulties"
              :key="d.value"
              :label="d.label"
              color="white"
              :text-color="
                engine.difficulty.value === d.value ? 'accent' : 'grey-7'
              "
              :unelevated="engine.difficulty.value === d.value"
              :outline="engine.difficulty.value !== d.value"
              rounded
              size="md"
              class="diff-btn"
              @click="engine.setDifficulty(d.value)"
            />
          </div>
        </div>

        <div class="difficulty-section">
          <p class="difficulty-label">Rules</p>
          <div class="difficulty-buttons">
            <q-btn
              v-for="r in rulesOptions"
              :key="r.value"
              :label="r.label"
              :color="'white'"
              :text-color="
                engine.rules.value === r.value ? 'secondary' : 'grey-7'
              "
              :unelevated="engine.rules.value === r.value"
              :outline="engine.rules.value !== r.value"
              rounded
              size="md"
              class="diff-btn"
              @click="engine.setRules(r.value)"
            />
          </div>
          <p class="rules-hint">
            {{
              engine.rules.value === 'arcade'
                ? 'Rally scoring, every rally wins a point'
                : 'Side-out scoring, only server scores, diagonal serves'
            }}
          </p>
        </div>

        <q-btn
          label="Play"
          color="white"
          text-color="accent"
          unelevated
          rounded
          size="lg"
          class="play-btn"
          @click="startPlaying"
        />

        <div class="controls-hint">
          <p v-if="!isTouch" class="hint-text">
            <kbd>A</kbd> <kbd>D</kbd> or <kbd>←</kbd> <kbd>→</kbd> to move
            &nbsp;|&nbsp; <kbd>W</kbd> <kbd>S</kbd> or <kbd>↑</kbd>
            <kbd>↓</kbd> for depth &nbsp;|&nbsp; Move to serve
          </p>
          <p v-else class="hint-text">
            Use the on-screen controls to move &nbsp;|&nbsp; Move to serve
          </p>
        </div>
      </div>
    </div>

    <!-- Game over overlay -->
    <div v-if="engine.gameState.value === 'game-over'" class="menu-overlay">
      <div class="menu-card">
        <h1 class="menu-title">
          {{ engine.winner.value === 'player' ? 'You Win!' : 'AI Wins!' }}
        </h1>
        <p class="menu-subtitle">
          {{ engine.playerScore.value }}, {{ engine.aiScore.value }}
        </p>
        <q-btn
          label="Play Again"
          color="white"
          text-color="accent"
          unelevated
          rounded
          size="lg"
          class="play-btn"
          @click="startPlaying"
        />
        <q-btn
          label="Main Menu"
          color="white"
          text-color="grey-7"
          rounded
          class="menu-btn"
          outline
          @click="engine.resetScore()"
        />
      </div>
    </div>

    <!-- Floating joystick layer (touch only) -->
    <div
      v-if="
        isTouch &&
        (engine.gameState.value === 'playing' ||
          engine.gameState.value === 'point-scored')
      "
      class="joystick-layer"
      @touchstart.prevent="onJoystickStart"
      @touchmove.prevent="onJoystickMove"
      @touchend.prevent="onJoystickEnd"
      @touchcancel.prevent="onJoystickEnd"
    >
      <div
        v-if="joystick.active"
        class="joystick-base"
        :style="{ left: `${joystick.baseX}px`, top: `${joystick.baseY}px` }"
      >
        <div
          class="joystick-knob"
          :style="{
            transform: `translate(${joystick.knobX}px, ${joystick.knobY}px)`,
          }"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, reactive } from 'vue';
import { useRouter } from 'vue-router';
import GameScene from 'components/play/GameScene.vue';
import {
  useGameEngine,
  type Difficulty,
  type Rules,
} from 'src/composables/useGameEngine';

const engine = useGameEngine();
const router = useRouter();
const goBack = () => {
  if (window.history.length > 1) {
    router.back();
  } else {
    router.push('/');
  }
};

interface JoystickState {
  active: boolean;
  baseX: number;
  baseY: number;
  knobX: number;
  knobY: number;
  identifier: number | null;
}

const KNOB_MAX = 35;

const joystick = reactive<JoystickState>({
  active: false,
  baseX: 0,
  baseY: 0,
  knobX: 0,
  knobY: 0,
  identifier: null,
});

function getTouch(e: TouchEvent, id: number | null): Touch | undefined {
  return Array.from(e.changedTouches).find(
    (t) => id === null || t.identifier === id,
  );
}

function onJoystickStart(e: TouchEvent) {
  // Only accept touches in the lower ~70% of the screen for joystick
  const touch = e.changedTouches[0];
  if (!touch || touch.clientY < window.innerHeight * 0.3) return;

  joystick.active = true;
  joystick.identifier = touch.identifier;
  joystick.baseX = touch.clientX;
  joystick.baseY = touch.clientY;
  joystick.knobX = 0;
  joystick.knobY = 0;
}

function updateJoystick(touch: Touch) {
  const dx = touch.clientX - joystick.baseX;
  const dy = touch.clientY - joystick.baseY;
  const dist = Math.hypot(dx, dy);
  const maxDist = KNOB_MAX;

  let nx = 0;
  let ny = 0;
  if (dist > 0) {
    nx = (dx / dist) * Math.min(dist, maxDist);
    ny = (dy / dist) * Math.min(dist, maxDist);
  }

  joystick.knobX = nx;
  joystick.knobY = ny;

  // Map to analog axis (-1..1)
  const axisX = nx / maxDist;
  const axisZ = ny / maxDist;

  // Apply dead zone (~20%)
  const deadZone = 0.2;
  const applyDead = (v: number) =>
    Math.abs(v) < deadZone ? 0 : (v - Math.sign(v) * deadZone) / (1 - deadZone);

  engine.setAxis(applyDead(axisX), applyDead(axisZ));
}

function onJoystickMove(e: TouchEvent) {
  const touch = getTouch(e, joystick.identifier);
  if (!touch || !joystick.active) return;
  updateJoystick(touch);
}

function onJoystickEnd(e: TouchEvent) {
  const touch = getTouch(e, joystick.identifier);
  if (!touch) return;

  joystick.active = false;
  joystick.identifier = null;
  joystick.knobX = 0;
  joystick.knobY = 0;
  engine.setAxis(0, 0);
}

const difficulties: { label: string; value: Difficulty }[] = [
  { label: 'Easy', value: 'easy' },
  { label: 'Medium', value: 'medium' },
  { label: 'Hard', value: 'hard' },
];

const rulesOptions: { label: string; value: Rules }[] = [
  { label: 'Rally', value: 'arcade' },
  { label: 'Classic', value: 'authentic' },
];

const isTouch =
  typeof window !== 'undefined' &&
  ('ontouchstart' in window || navigator.maxTouchPoints > 0);

function startPlaying() {
  engine.sound.ensureCtx();
  engine.sound.startMusic();
  engine.startGame();
  engine.startLoop();
}

function onKeyDown(e: KeyboardEvent) {
  engine.onKeyDown(e);
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', engine.onKeyUp);
  engine.startLoop();
  if (engine.sound.musicEnabled.value) {
    engine.sound.ensureCtx();
    engine.sound.startMusic();
  }
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', engine.onKeyUp);
  engine.sound.stopMusic();
  engine.cleanup();
});
</script>

<style lang="scss" scoped>
.play-page {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.scene-container {
  position: absolute;
  inset: 0;
}

.top-left-row {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 4px;
}

.score-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 20px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  pointer-events: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

@media (max-width: 767px) {
  .score-pill {
    position: fixed;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 10;
  }
}

@media (min-width: 768px) {
  .top-left-row {
    gap: 16px;
  }
  .score-pill {
    position: fixed;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 10;
  }
}

.score-label {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.score-num {
  font-size: 28px;
  font-weight: 800;
  color: #ffffff;
  min-width: 28px;
  text-align: center;
}

.score-you-label {
  color: #ffffff;
}

.score-ai-label {
  color: #ffffff;
}

.score-you-num {
  color: #ffffff;
  text-shadow: 0 0 8px rgba(199, 210, 254, 0.6);
}

.score-ai-num {
  color: #ffffff;
  text-shadow: 0 0 8px rgba(251, 207, 232, 0.6);
}

.score-sep {
  font-size: 22px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.8);
  margin: 0 4px;
}

.server-dot {
  color: #fde047;
  font-size: 10px;
  margin-right: 2px;
}

.point-toast {
  position: absolute;
  top: 120px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  font-size: 32px;
  font-weight: 800;
  color: #fde047;
  text-shadow:
    0 2px 12px rgba(0, 0, 0, 0.8),
    0 0 20px rgba(253, 224, 71, 0.3);
  pointer-events: none;
  animation: announce 0.5s ease;
  text-align: center;
  max-width: 90vw;
  word-wrap: break-word;
}

@media (min-width: 768px) {
  .point-toast {
    font-size: 40px;
    white-space: nowrap;
  }
}

@keyframes announce {
  0% {
    transform: translateX(-50%) scale(0.3);
    opacity: 0;
  }
  20% {
    transform: translateX(-52%) scale(1.1);
    opacity: 1;
  }
  25% {
    transform: translateX(-48%) scale(1.1);
  }
  30% {
    transform: translateX(-52%) scale(1.1);
  }
  35% {
    transform: translateX(-48%) scale(1.1);
  }
  40% {
    transform: translateX(-50%) scale(1.1);
  }
  60% {
    transform: translateX(-51%) scale(1);
  }
  65% {
    transform: translateX(-49%) scale(1);
  }
  70% {
    transform: translateX(-50%) scale(1);
  }
  100% {
    transform: translateX(-50%) scale(1);
    opacity: 1;
  }
}

.serve-hint-container {
  position: absolute;
  bottom: 100px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.serve-hint {
  color: rgba(255, 255, 255, 0.9);
  font-size: 13px;
  margin: 0;
  text-align: center;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
  font-weight: 600;
}

@keyframes pop {
  0% {
    transform: scale(0.5);
    opacity: 0;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

@media (min-width: 768px) {
  .point-toast {
    animation: announce 0.5s ease;
  }
}

@keyframes pop-center {
  0% {
    transform: translateX(-50%) scale(0.5);
    opacity: 0;
  }
  100% {
    transform: translateX(-50%) scale(1);
    opacity: 1;
  }
}

.top-right-exit {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 25;
  display: flex;
  align-items: center;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 999px;
  padding: 4px;
}

.top-right-controls {
  position: absolute;
  top: 64px;
  right: 16px;
  z-index: 25;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 999px;
  padding: 4px;
}

@media (min-width: 768px) {
  .top-right-controls {
    top: 16px;
  }
}

.menu-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(30, 20, 50, 0.6);
  backdrop-filter: blur(8px);
}

.menu-card {
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 24px;
  padding: 40px 64px;
  text-align: center;
  max-width: 400px;
  width: 90%;
  box-shadow: 0 8px 32px rgba(118, 75, 162, 0.3);
}

.menu-title {
  font-size: 32px;
  font-weight: 800;
  color: white;
  line-height: 1.1;
  white-space: nowrap;
  display: flex;
  justify-content: center;
  margin: 0 auto 16px;
}

.menu-subtitle {
  font-size: 16px;
  color: rgba(255, 255, 255, 0.9);
  margin: 0 0 24px;
}

.difficulty-section {
  margin-bottom: 24px;
}

.difficulty-label {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.85);
  margin: 0 0 12px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.rules-hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.75);
  margin: 8px 0 0;
  line-height: 1.4;
}

.difficulty-buttons {
  display: flex;
  gap: 8px;
  justify-content: center;
  padding: 8px 16px;
}

.diff-btn {
  min-width: 80px;
  padding: 4px 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.play-btn {
  width: 100%;
  margin-bottom: 16px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}

.play-btn:last-child {
  margin-bottom: 0;
}

.menu-btn {
  width: 100%;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.controls-hint {
  margin-top: 16px;
}

.hint-text {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
  line-height: 1.6;
}

kbd {
  display: inline-block;
  padding: 2px 6px;
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 4px;
  font-size: 12px;
  font-family: monospace;
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

.joystick-layer {
  position: absolute;
  inset: 0;
  z-index: 15;
  touch-action: none;
}

.joystick-base {
  position: absolute;
  width: 100px;
  height: 100px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.25);
  border: 2px solid rgba(255, 255, 255, 0.45);
  transform: translate(-50%, -50%);
  pointer-events: none;
  backdrop-filter: blur(2px);
}

.joystick-knob {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 48px;
  height: 48px;
  margin-left: -24px;
  margin-top: -24px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.85);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  pointer-events: none;
}
</style>

<style>
.q-tooltip {
  white-space: nowrap !important;
}
</style>
