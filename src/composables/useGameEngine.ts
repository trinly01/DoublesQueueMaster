import { ref, reactive, computed, onUnmounted } from 'vue';
import * as THREE from 'three';
import { useSound } from 'src/composables/useSound';
import {
  useP2P,
  type StatePayload,
  type InputPayload,
  type EventPayload,
} from 'src/composables/useP2P';
import {
  useRandomPalette,
  type CharacterPalette,
} from 'src/composables/useRandomPalette';
import { PlayerProfile } from 'src/services/playerProfile';

// Court dimensions (scaled to scene units: 1 unit = 1 meter)
const COURT_LENGTH = 13.41; // 44ft
const COURT_WIDTH = 6.1; // 20ft
const NET_HEIGHT = 0.86; // 34in
const KITCHEN_DEPTH = 2.13; // 7ft non-volley zone each side

// Ball physics
const GRAVITY = -9.8;
const BALL_RADIUS = 0.08;
const HIT_COOLDOWN = 0.4; // seconds between hits per player

// Jump physics
const JUMP_VELOCITY = 4.0;
const JUMP_GRAVITY = -12.0;

// Game
const WIN_SCORE = 11;
const POINT_PAUSE = 1.2; // seconds pause after a point

export type Difficulty = 'easy' | 'medium' | 'hard';
export type GameState =
  | 'menu'
  | 'playing'
  | 'point-scored'
  | 'game-over'
  | 'paused'
  | 'connecting'
  | 'waiting'
  | 'reconnecting';
export type Rules = 'arcade' | 'authentic';

interface AIConfig {
  speed: number; // movement speed (player = 3.5)
  reactionDelay: number; // seconds before AI reacts to ball direction
  accuracy: number; // 0..1, higher = less error
  dinkChance: number; // base chance to dink into kitchen
  dinkBonusStanding: number; // extra dink chance when player standing still
  netFaultChance: number; // chance dink hits net (fault)
  targetBias: number; // how far to target away from player (0 = random)
  playerMagnet: number; // 0..1, gentle pull toward ball X for easier navigation
  aiMagnet: number; // 0..1, how tightly AI tracks ball X (hard = more)
}

const PLAYER_MAX_SPEED = 3.5;

const AI_CONFIGS: Record<Difficulty, AIConfig> = {
  // Easy: slightly slower, moderate reaction, misses sometimes
  easy: {
    speed: PLAYER_MAX_SPEED * 0.65,
    reactionDelay: 0.25,
    accuracy: 0.7,
    dinkChance: 0.12,
    dinkBonusStanding: 0.25,
    netFaultChance: 0.25,
    targetBias: 0,
    playerMagnet: 0.6,
    aiMagnet: 0,
  },
  // Medium: close to player speed, good reaction, occasional misses
  medium: {
    speed: PLAYER_MAX_SPEED * 0.82,
    reactionDelay: 0.16,
    accuracy: 0.83,
    dinkChance: 0.2,
    dinkBonusStanding: 0.25,
    netFaultChance: 0.18,
    targetBias: 0.8,
    playerMagnet: 0.3,
    aiMagnet: 0.4,
  },
  // Hard: matches player speed, sharp reaction, rare misses
  hard: {
    speed: PLAYER_MAX_SPEED * 0.95,
    reactionDelay: 0.08,
    accuracy: 0.93,
    dinkChance: 0.3,
    dinkBonusStanding: 0.25,
    netFaultChance: 0.1,
    targetBias: 1.5,
    playerMagnet: 0.06,
    aiMagnet: 0.8,
  },
};

export interface GameRefs {
  playerPos: THREE.Vector3;
  aiPos: THREE.Vector3;
  ballPos: THREE.Vector3;
  ballVel: THREE.Vector3;
  ballBouncePredict: THREE.Vector3 | null; // predicted bounce point, null if no valid prediction
  playerSwing: number; // 0..1 swing animation
  aiSwing: number;
  playerSwingDir: number; // -1 = left, 1 = right
  aiSwingDir: number;
  playerMoveDir: number; // current movement direction -1..1 (X axis)
  aiMoveDir: number;
  playerMoveZ: number; // forward/backward velocity -1..1
  aiMoveZ: number;
  playerReach: number; // 0..1 how far paddle reaches toward ball
  aiReach: number;
  playerPaddleAngle: number; // radians, paddle yaw toward ball
  aiPaddleAngle: number;
  servePending: boolean; // true before serve — heads face opponent
}

export function useGameEngine() {
  const sound = useSound();
  const p2p = useP2P();
  const gameState = ref<GameState>('menu');
  const mode = ref<'ai' | 'pvp'>('ai');
  const roomId = ref(
    (typeof window !== 'undefined' && localStorage.getItem('dqm_room')) || '',
  );
  const difficulty = ref<Difficulty>(
    (typeof window !== 'undefined' &&
      (localStorage.getItem('dqm_difficulty') as Difficulty)) ||
      'medium',
  );
  const rules = ref<Rules>(
    (typeof window !== 'undefined' &&
      (localStorage.getItem('dqm_rules') as Rules)) ||
      'arcade',
  );
  const playerScore = ref(0);
  const aiScore = ref(0);
  const winner = ref<'player' | 'ai' | null>(null);
  const winReason = ref<'score' | 'forfeit' | null>(null);
  const lastPointMsg = ref('');
  const scoringSide = ref<'player' | 'ai' | null>(null);
  const server = ref<'player' | 'ai'>('player');
  const servePending = ref(false);

  // Shared mutable positions (read by the 3D scene each frame)
  const refs: GameRefs = {
    playerPos: new THREE.Vector3(0, 0, COURT_LENGTH / 2 - 1),
    aiPos: new THREE.Vector3(0, 0, -COURT_LENGTH / 2 + 1),
    ballPos: new THREE.Vector3(0, 1.2, 0),
    ballVel: new THREE.Vector3(0, 0, 0),
    ballBouncePredict: null,
    playerSwing: 0,
    aiSwing: 0,
    playerSwingDir: 1,
    aiSwingDir: 1,
    playerMoveDir: 0,
    aiMoveDir: 0,
    playerMoveZ: 0,
    aiMoveZ: 0,
    playerReach: 0,
    aiReach: 0,
    playerPaddleAngle: 0,
    aiPaddleAngle: 0,
    servePending: false,
  };

  // Character palettes — generated once, synced from host to guest via P2P
  const { randomPalette } = useRandomPalette();
  const playerPalette = ref<CharacterPalette>(randomPalette());
  const aiPalette = ref<CharacterPalette>(randomPalette());
  if (aiPalette.value.bodyColor === playerPalette.value.bodyColor) {
    aiPalette.value = randomPalette();
  }

  // Opponent display name (synced via P2P in PvP)
  const opponentName = ref('');

  // Input state
  const input = reactive({
    left: false,
    right: false,
    forward: false,
    backward: false,
    axisX: 0, // analog joystick -1..1
    axisZ: 0, // analog joystick -1..1 (negative = forward)
    jump: false, // jump requested this frame
  });

  // Jump state
  let playerJumpVel: number = 0;
  let remoteJumpVel: number = 0;

  let lastTime = 0;
  let playerHitCooldown = 0;
  let aiHitCooldown = 0;
  let aiReactionTimer = 0;
  let aiTargetX = 0;
  let pointPauseTimer = 0;
  const servingTo = ref<'player' | 'ai'>('player');

  // Rules tracking
  let lastHitBy: 'player' | 'ai' | null = null;
  let rallyHitCount = 0; // 0 = serve, 1 = return, 2 = third shot, volleys allowed from 3rd on
  let bounceCountThisSide = 0; // bounces on current side since last hit
  let ballBouncedOnSide = false; // has the ball bounced since crossing to current side
  let ballClippedNet = false; // ball clipped net but continued — fault should say Net! not In!
  let currentSide: 'player' | 'ai' | null = null; // which side the ball is currently on
  let serveTimer = 0;
  let serveFromX = 0; // server's X position when serving (to check wrong court)
  let servePosZ = 0; // server's Z position when serving (to snap back on serve trigger)
  let lastFaultEventSeq = -1; // host: last fault event seq processed (dedup)
  let lastBounceFaultSeq = -1; // host: last bounce-fault event seq processed (dedup)
  let lastPointMsgSeq = -1; // guest: highest state seq from which lpm was synced
  let pendingFaultAck: {
    seq: number;
    type: string;
    ballY: number;
    retries: number;
    timer: ReturnType<typeof setTimeout> | null;
  } | null = null;
  // Delayed bounce fault: in PvP, bounce-based faults on guest's side are delayed
  // to give guest collision reports time to arrive. If a collision report arrives
  // with ballY proving the ball was in the air, the bounce fault is cancelled.
  let pendingBounceFault: {
    forWhom: 'player' | 'ai';
    reason: string;
    timer: ReturnType<typeof setTimeout> | null;
  } | null = null;
  let aiDinkRead: boolean | null = null; // null = not evaluated, true/false = committed

  // Guest-side bounce tracking (for reporting double bounces to host)
  let guestBounceCount = 0;
  let guestPrevBallY = 999; // track previous ball Y to detect bounce (y crosses below BALL_RADIUS)
  let guestCurrentSide: 'player' | 'ai' | null = null;
  // Guest-side rally state (synced from host state updates for fault detection)
  let guestRallyHitCount = 0;
  let guestLastHitBy: 'player' | 'ai' | null = null;
  let guestServeFromX = 0;
  let guestBallClippedNet = false;

  // Precomputed constants for hot loops
  const HALF_COURT_W = COURT_WIDTH / 2;
  const HALF_COURT_L = COURT_LENGTH / 2;
  const CLAMP_HALF_W = HALF_COURT_W + 1;
  const CLAMP_BACK = HALF_COURT_L + 2;
  const CLAMP_AI_BACK = -HALF_COURT_L - 2;
  const BOUNCE_PREDICT_INTERVAL = 0.048; // ~3 frames at 60fps
  let bouncePredictTimer = 0;

  // Velocity tracking for impact-force physics
  const playerVel = new THREE.Vector3();
  const aiVel = new THREE.Vector3();
  const prevPlayerPos = new THREE.Vector3();
  const prevAiPos = new THREE.Vector3();
  const PLAYER_ACCEL = 12; // how fast player reaches target speed
  const PLAYER_FRICTION = 8; // how fast player decelerates when no input
  const playerCurrentVel = new THREE.Vector3();
  const aiCurrentVel = new THREE.Vector3();
  const AI_ACCEL = 10;

  // Pre-allocated temp vectors to avoid per-frame allocations
  const _tempVel = new THREE.Vector3();
  const _tempTarget = new THREE.Vector3();

  // Sound effects queue — host queues sounds for guest to play
  const sfxQueue: string[] = [];
  function hostPlaySfx(name: string) {
    sfxQueue.push(name);
    switch (name) {
      case 'paddleHit':
        sound.paddleHit();
        break;
      case 'ballBounce':
        sound.ballBounce();
        break;
      case 'netHit':
        sound.netHit();
        break;
      case 'serve':
        sound.serve();
        break;
      case 'fault':
        sound.fault();
        break;
      case 'pointScored':
        sound.pointScored();
        break;
    }
  }
  function playGuestSfx(name: string) {
    switch (name) {
      case 'paddleHit':
        sound.paddleHit();
        break;
      case 'ballBounce':
        sound.ballBounce();
        break;
      case 'netHit':
        sound.netHit();
        break;
      case 'serve':
        sound.serve();
        break;
      case 'fault':
        sound.fault();
        break;
      case 'pointScored':
        sound.pointScored();
        break;
    }
  }

  function setDifficulty(d: Difficulty) {
    difficulty.value = d;
    if (typeof window !== 'undefined')
      localStorage.setItem('dqm_difficulty', d);
  }

  function setRules(r: Rules) {
    rules.value = r;
    if (typeof window !== 'undefined') localStorage.setItem('dqm_rules', r);
  }

  function setRoomId(id: string) {
    roomId.value = id;
    if (typeof window !== 'undefined') localStorage.setItem('dqm_room', id);
  }

  // --- PvP state ---
  // Remote input (host receives from guest)
  const remoteInput = reactive({
    ax: 0,
    az: 0,
    sv: false,
    jump: false,
    seq: 0,
  });
  let lastInputSeq = -1;

  // Guest-side interpolation state
  let lastStateReceivedAt = 0;
  let stateBroadcastTimer = 0;
  const STATE_BROADCAST_INTERVAL = 0.05; // 20Hz

  // Reconnect handshake: wait for fresh data before resuming
  let waitingForReconnectData = false;
  let reconnectGraceTimer = 0;

  // Clear role indicators for readable conditionals
  const isPvP = computed(() => mode.value === 'pvp');
  const isHost = computed(() => isPvP.value && p2p.role.value === 'host');
  const isGuest = computed(() => isPvP.value && p2p.role.value === 'guest');

  // Player side multiplier: 1 = z>0 half (host/AI), -1 = z<0 half (PvP guest)
  // Used only for physics clamping in updatePlayer
  const playerSide = computed(() => (isGuest.value ? -1 : 1));

  // Whose turn to serve? Host serves when servingTo === 'player', guest when 'ai'
  const myServeTurn = computed(() =>
    isGuest.value ? servingTo.value === 'ai' : servingTo.value === 'player',
  );

  // Hermite interpolation helper for ball position
  function hermiteLerp(
    p0: THREE.Vector3,
    v0: THREE.Vector3,
    p1: THREE.Vector3,
    v1: THREE.Vector3,
    t: number,
  ): THREE.Vector3 {
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    return new THREE.Vector3(
      h00 * p0.x + h10 * v0.x + h01 * p1.x + h11 * v1.x,
      h00 * p0.y + h10 * v0.y + h01 * p1.y + h11 * v1.y,
      h00 * p0.z + h10 * v0.z + h01 * p1.z + h11 * v1.z,
    );
  }

  // Snap ball to host state (on events like paddle hit, bounce)
  let snapBallNextFrame = false;

  let pendingStartTimer: ReturnType<typeof setTimeout> | null = null;

  function startPvP() {
    mode.value = 'pvp';
    gameState.value = 'connecting';
    p2p.joinGameRoom(roomId.value);

    // Set up callbacks
    p2p.onPeerJoin(() => {
      if (gameState.value === 'waiting' || gameState.value === 'connecting') {
        // Only host starts the game; guest waits for state sync
        if (isHost.value) {
          // Delay start to allow a reconnecting guest to send pause event first
          if (pendingStartTimer) clearTimeout(pendingStartTimer);
          pendingStartTimer = setTimeout(() => {
            pendingStartTimer = null;
            if (
              gameState.value === 'waiting' ||
              gameState.value === 'connecting'
            ) {
              startGame();
            }
          }, 1000);
        }
      }
    });

    p2p.onPeerLeave(() => {
      if (
        gameState.value === 'playing' ||
        gameState.value === 'point-scored' ||
        gameState.value === 'paused'
      ) {
        gameState.value = 'reconnecting';
        waitingForReconnectData = false;
      }
    });

    p2p.onStateReceived((data: StatePayload) => {
      // Guest receives authoritative state from host
      if (!isPvP.value) return;
      // If we receive state, we must be the guest (host doesn't receive state)
      if (p2p.role.value === null) {
        p2p.role.value = 'guest';
        refs.playerPos.set(0, 0, -(COURT_LENGTH / 2 - 1));
      }
      if (!isGuest.value) return;
      p2p.pushToJitterBuffer(data);
      lastStateReceivedAt = performance.now();

      // Play sound effects queued by host
      if (data.sfx && data.sfx.length > 0) {
        for (const sfxName of data.sfx) {
          playGuestSfx(sfxName);
        }
      }

      // Update scores and server from state
      playerScore.value = data.ps;
      aiScore.value = data.as;
      server.value = data.sv;

      // Serve state — snap both players to baseline on serve reset (false→true transition only)
      const wasServePending = servePending.value;
      servePending.value = data.sp;
      if (data.sp && !wasServePending) {
        // Host just called resetBall — snap to correct positions
        // Host's playerPos (pp) = opponent on guest → aiPos
        // Host's aiPos (ap) = self on guest → playerPos
        refs.aiPos.set(data.pp[0], 0, data.pp[2]);
        refs.playerPos.set(data.ap[0], 0, data.ap[2]);
        p2p.clearJitterBuffer();
      }

      // Sync servingTo: from host's perspective, 'ai' = guest (opponent)
      servingTo.value = data.sv;

      // Sync last point message immediately (not just in interpolateGuestState)
      // so the guest sees fault messages during point-scored state too.
      // Use seq ordering to prevent older snapshots from regressing the message.
      if (data.lpm && data.seq > lastPointMsgSeq) {
        lastPointMsgSeq = data.seq;
        lastPointMsg.value = guestLpm(
          data.lpm,
          data.hn || '',
          data.gn || PlayerProfile.state.firstName || 'Opp',
        );
      }

      // Sync game state from host
      if (
        data.gs === 'playing' ||
        data.gs === 'point-scored' ||
        data.gs === 'paused' ||
        data.gs === 'game-over'
      ) {
        if (gameState.value === 'connecting' || gameState.value === 'waiting') {
          gameState.value = 'playing';
          // Snap to host's position for guest (host's aiPos = guest's playerPos)
          refs.playerPos.set(data.ap[0], 0, data.ap[2]);
        } else if (
          gameState.value === 'playing' &&
          data.gs === 'point-scored'
        ) {
          gameState.value = 'point-scored';
          pointPauseTimer = POINT_PAUSE;
        } else if (
          gameState.value === 'point-scored' &&
          data.gs === 'playing'
        ) {
          gameState.value = 'playing';
          // Snap to new serve position (host just called resetBall)
          refs.playerPos.set(data.ap[0], 0, data.ap[2]);
        } else if (
          data.gs === 'paused' &&
          gameState.value !== 'paused' &&
          !isPvP.value
        ) {
          gameState.value = 'paused';
        } else if (data.gs === 'game-over' && gameState.value !== 'game-over') {
          gameState.value = 'game-over';
          if (playerScore.value >= WIN_SCORE) {
            winner.value = 'player';
            if (isGuest.value) sound.lose();
            else sound.win();
          } else {
            winner.value = 'ai';
            if (isGuest.value) sound.win();
            else sound.lose();
          }
        } else if (
          data.gs === 'playing' &&
          gameState.value === 'paused' &&
          !isPvP.value
        ) {
          gameState.value = 'playing';
        }
      }
    });

    p2p.onInputReceived((data: InputPayload) => {
      // Host receives input from guest
      if (!isHost.value) return;
      if (data.seq <= lastInputSeq) return; // discard stale
      lastInputSeq = data.seq;
      remoteInput.ax = data.ax;
      remoteInput.az = data.az;
      if (data.jk) remoteInput.jump = true;
      // Sync guest name
      if (data.gn) opponentName.value = data.gn;
      if (data.sv && servePending.value && servingTo.value === 'ai') {
        // Execute guest's serve on host side
        // Snap AI back to serve position (guest may have drifted forward while triggering serve)
        refs.aiPos.z = servePosZ;
        if (refs.aiPos.z > -COURT_LENGTH / 2) {
          scorePoint('player', 'Foot fault!');
          servePending.value = false;
        } else {
          servePending.value = false;
          doServe();
        }
      }
    });

    p2p.onEventReceived((data: EventPayload) => {
      if (data.type === 'ready' && p2p.role.value === null) {
        // Sync opponent name from ready event
        if (data.name) opponentName.value = data.name;
        if (data.data === 'host') {
          // Guest tells us we're the host (reconnection after host refresh)
          p2p.role.value = 'host';
          // onPeerJoin already fired but isHost was false — start delayed game start now
          if (
            (gameState.value === 'connecting' ||
              gameState.value === 'waiting') &&
            !pendingStartTimer
          ) {
            pendingStartTimer = setTimeout(() => {
              pendingStartTimer = null;
              if (
                gameState.value === 'waiting' ||
                gameState.value === 'connecting'
              ) {
                startGame();
              }
            }, 1000);
          }
        } else {
          // Host told us we're the guest
          p2p.role.value = 'guest';
          // Flip player to opposite side of court
          refs.playerPos.set(0, 0, -(COURT_LENGTH / 2 - 1));
        }
      } else if (data.type === 'ready' && data.name) {
        // Already have a role — just sync the name (reconnect scenario)
        opponentName.value = data.name;
      } else if (data.type === 'resync' && isGuest.value) {
        p2p.clearJitterBuffer();
        snapBallNextFrame = true;
      } else if (data.type === 'sync-scores' && isHost.value) {
        // Guest sends scores after host refresh reconnection
        if (typeof data.data === 'string') {
          const parts = data.data.split(',');
          playerScore.value = parseInt(parts[0]) || 0;
          aiScore.value = parseInt(parts[1]) || 0;
          if (parts[2] === 'player' || parts[2] === 'ai') {
            server.value = parts[2] as 'player' | 'ai';
          }
          if (parts[3] === 'player' || parts[3] === 'ai') {
            servingTo.value = parts[3] as 'player' | 'ai';
          }
          servePending.value = parts[4] === 'true';
          // Cancel pending startGame — this is a reconnection, not a new game
          if (pendingStartTimer) {
            clearTimeout(pendingStartTimer);
            pendingStartTimer = null;
          }
          // Transition to paused so players can resume manually
          if (
            gameState.value === 'connecting' ||
            gameState.value === 'waiting' ||
            gameState.value === 'reconnecting'
          ) {
            pausedFromState = 'playing';
            gameState.value = 'paused';
            p2p.broadcastEvent({ type: 'resync' });
            p2p.broadcastEvent({ type: 'pause' });
            // Always replay from serve after reconnection (let rule)
            servePending.value = true;
            resetBall(servingTo.value);
          }
        }
      } else if (data.type === 'pause') {
        if (
          gameState.value === 'playing' ||
          gameState.value === 'point-scored' ||
          gameState.value === 'reconnecting' ||
          gameState.value === 'connecting' ||
          gameState.value === 'waiting' ||
          gameState.value === 'menu'
        ) {
          pausedFromState = 'playing';
          gameState.value = 'paused';
        }
      } else if (data.type === 'resume') {
        if (gameState.value === 'paused') {
          gameState.value = pausedFromState;
          // Reset both players to serve positions
          resetBall(servingTo.value);
          p2p.clearJitterBuffer();
        }
      } else if (data.type === 'game-over' && isGuest.value) {
        winReason.value = data.data === 'forfeit' ? 'forfeit' : 'score';
        gameState.value = 'game-over';
        if (winReason.value !== 'forfeit') {
          if (playerScore.value >= WIN_SCORE) {
            winner.value = 'player';
            sound.lose();
          } else {
            winner.value = 'ai';
            sound.win();
          }
        }
      } else if (data.type === 'fault' && isHost.value) {
        // Guest reported a local body/paddle collision.
        // Host processes it via tryHit — host's rule logic determines outcome
        // (good return, volley fault, or kitchen fault).
        // Dedup using event seq: ignore if already processed.
        const seq = data.seq ?? -1;
        if (seq <= lastFaultEventSeq) {
          // Duplicate — still ack so guest stops retrying
          p2p.broadcastEvent({ type: 'fault-ack' });
          return;
        }
        lastFaultEventSeq = seq;
        // Ack so guest stops retrying
        p2p.broadcastEvent({ type: 'fault-ack' });
        // Check if this collision overrides a pending bounce fault.
        // If guest's ballY proves the ball was in the air, the collision
        // happened before the bounce — cancel the bounce fault.
        const guestBallY = data.ballY ?? 0;
        const overridden = cancelPendingBounceFault(guestBallY);
        if (overridden) {
          // Bounce fault was cancelled — process the collision instead
          tryHit(refs.aiPos, refs.ballPos, refs.ballVel, false, true);
        } else if (
          !pendingBounceFault &&
          gameState.value === 'playing' &&
          !servePending.value
        ) {
          // No pending bounce fault — normal collision processing
          tryHit(refs.aiPos, refs.ballPos, refs.ballVel, false, true);
        }
        // If pendingBounceFault exists and wasn't overridden, the ball had
        // already bounced — the bounce fault takes priority, ignore the collision.
      } else if (data.type === 'fault-ack' && isGuest.value) {
        // Host acknowledged our fault report — stop retrying
        handleFaultAck();
      } else if (data.type === 'bounce-fault' && isHost.value) {
        // Guest reported a bounce fault on its side — score immediately
        // Dedup using event seq: ignore if already processed
        const seq = data.seq ?? -1;
        if (seq <= lastBounceFaultSeq) return; // duplicate, ignore
        lastBounceFaultSeq = seq;
        // Cancel any pending bounce fault — guest's report takes priority
        if (pendingBounceFault?.timer) clearTimeout(pendingBounceFault.timer);
        pendingBounceFault = null;
        if (gameState.value === 'playing') {
          const faultType = data.data as string;
          // Guest's side = 'ai' side from host's perspective
          // 'out' → opponent (host) scores, fault by guest
          // 'in' → opponent (host) scores (double bounce, guest didn't return)
          // 'net' → fault by hitter (lastHitBy)
          // serve faults → opponent (host) scores
          if (faultType === 'out') {
            const faultBy = lastHitBy;
            if (faultBy) {
              scorePoint(faultBy === 'player' ? 'ai' : 'player', 'Out!');
            }
          } else if (faultType === 'in') {
            scorePoint('player', 'In!');
          } else if (faultType === 'net') {
            const faultBy = lastHitBy;
            if (faultBy) {
              scorePoint(faultBy === 'player' ? 'ai' : 'player', 'Net!');
            }
          } else if (faultType === 'serve-out') {
            scorePoint('player', 'Serve out!');
          } else if (faultType === 'serve-kitchen') {
            scorePoint('player', 'Serve into kitchen!');
          } else if (faultType === 'short-serve') {
            scorePoint('player', 'Short serve!');
          } else if (faultType === 'wrong-serving-side') {
            scorePoint('player', 'Wrong serving side!');
          } else if (faultType === 'wrong-court') {
            scorePoint('player', 'Wrong court!');
          }
        }
      } else if (data.type === 'fault-notify' && isGuest.value) {
        // Host scored a fault on its own side — show message immediately
        if (data.data) {
          const reason = data.data as string;
          const myName = PlayerProfile.state.firstName || 'You';
          const oppName = opponentName.value || 'Opp';
          // Host's forWhom: 'player' = host scored, 'ai' = guest scored
          // From guest's perspective: 'ai' = guest (self), 'player' = host (opponent)
          const scoringSide = data.ss ?? 'player';
          // For 'In!' the label is the scorer. For other faults, label is the faulting side.
          if (reason === 'In!') {
            // Scorer hit the ball in — label is scorer
            const label = scoringSide === 'ai' ? myName : oppName;
            lastPointMsg.value = `${label}: ${reason}`;
          } else {
            // Fault — label is the faulting side (opposite of scorer)
            const faultSide = scoringSide === 'player' ? 'ai' : 'player';
            const label = faultSide === 'ai' ? myName : oppName;
            lastPointMsg.value = `${label}: ${reason}`;
          }
        }
      }
    });

    // Transition to waiting after connection
    setTimeout(() => {
      if (gameState.value === 'connecting') {
        gameState.value = 'waiting';
      }
    }, 2000);
  }

  function cancelPvP() {
    p2p.leaveRoom();
    mode.value = 'ai';
    gameState.value = 'menu';
  }

  function startGame() {
    playerScore.value = 0;
    aiScore.value = 0;
    winner.value = null;
    winReason.value = null;
    lastPointMsg.value = '';
    lastPointMsgSeq = -1;
    scoringSide.value = null;
    gameState.value = 'playing';
    servingTo.value = 'player';
    server.value = 'player';
    resetBall('player');
    prevGamepadButtons = [];
  }

  function resetScore() {
    if (mode.value === 'pvp') {
      p2p.leaveRoom();
      mode.value = 'ai';
    }
    playerScore.value = 0;
    aiScore.value = 0;
    winner.value = null;
    winReason.value = null;
    lastPointMsg.value = '';
    lastPointMsgSeq = -1;
    scoringSide.value = null;
    gameState.value = 'menu';
  }

  let pausedFromState: GameState = 'playing';
  function pauseGame() {
    // Only allow pause during serve state (ball not yet moving)
    // Pausing mid-rally is not allowed — prevents unfair position freezes
    if (
      (gameState.value === 'playing' || gameState.value === 'point-scored') &&
      servePending.value
    ) {
      pausedFromState = gameState.value;
      gameState.value = 'paused';
      prevGamepadButtons = [];
      if (isPvP.value) {
        p2p.broadcastEvent({ type: 'pause' });
      }
    }
  }

  function resumeGame() {
    if (gameState.value === 'paused') {
      gameState.value = pausedFromState;
      prevGamepadButtons = [];
      if (isPvP.value) {
        // Both host and guest reset to serve positions
        // resetBall sets playerPos (opponent for guest) and aiPos (self for guest) correctly
        resetBall(servingTo.value);
        p2p.clearJitterBuffer();
        p2p.broadcastEvent({ type: 'resume' });
      }
    }
  }

  function resetBall(serveTo: 'player' | 'ai') {
    // Determine serve side: even score = right, odd = left
    const serverScore =
      serveTo === 'player' ? playerScore.value : aiScore.value;
    const serveRight = serverScore % 2 === 0;
    const serverX = serveRight ? 1.5 : -1.5;
    const receiverX = serveRight ? -1.5 : 1.5; // diagonal

    // Place BOTH players outside the court (behind their baselines) for serve
    const serverZ =
      serveTo === 'player' ? COURT_LENGTH / 2 + 0.8 : -COURT_LENGTH / 2 - 0.8;
    servePosZ = serverZ;
    const receiverZ =
      serveTo === 'player' ? -COURT_LENGTH / 2 - 0.8 : COURT_LENGTH / 2 + 0.8;

    // On host: playerPos = self (z>0), aiPos = opponent (z<0)
    // On guest: playerPos = self (z<0), aiPos = opponent (z>0)
    // servingTo 'player' = host serves, 'ai' = guest serves
    if (isGuest.value) {
      // Guest perspective: playerPos = self, aiPos = opponent
      if (serveTo === 'player') {
        // Host serves — host is opponent (aiPos), guest is receiver (playerPos)
        refs.aiPos.set(serverX, 0, serverZ);
        refs.playerPos.set(receiverX, 0, receiverZ);
      } else {
        // Guest serves — guest is server (playerPos), host is receiver (aiPos)
        refs.playerPos.set(serverX, 0, serverZ);
        refs.aiPos.set(receiverX, 0, receiverZ);
      }
    } else {
      // Host perspective: playerPos = self, aiPos = opponent
      if (serveTo === 'player') {
        refs.playerPos.set(serverX, 0, serverZ);
        refs.aiPos.set(receiverX, 0, receiverZ);
      } else {
        refs.aiPos.set(serverX, 0, serverZ);
        refs.playerPos.set(receiverX, 0, receiverZ);
      }
    }

    // Ball starts at server's paddle height, at server position
    refs.ballPos.set(0, 1.2, serverZ);
    refs.ballVel.set(0, 0, 0);

    // Reset rules tracking
    lastHitBy = null;
    rallyHitCount = 0;
    bounceCountThisSide = 0;
    ballBouncedOnSide = false;
    ballClippedNet = false;
    currentSide = null;
    aiDinkRead = null;
    playerJumpVel = 0;
    remoteJumpVel = 0;
    lastFaultEventSeq = -1;
    lastBounceFaultSeq = -1;
    // Reset guest bounce tracking
    guestBounceCount = 0;
    guestPrevBallY = 999;
    guestCurrentSide = null;
    guestRallyHitCount = 0;
    guestLastHitBy = null;
    guestServeFromX = 0;
    guestBallClippedNet = false;
    // Clear any pending fault ack on new rally
    if (pendingFaultAck?.timer) clearTimeout(pendingFaultAck.timer);
    pendingFaultAck = null;
    // Clear any pending bounce fault on new rally
    if (pendingBounceFault?.timer) clearTimeout(pendingBounceFault.timer);
    pendingBounceFault = null;
    servePending.value = true;
    serveTimer = 0; // not used for player serve; AI uses its own timer

    playerHitCooldown = 0;
    aiHitCooldown = 0;
    aiReactionTimer = 0;
    playerCurrentVel.set(0, 0, 0);
    aiCurrentVel.set(0, 0, 0);
  }

  function doServe() {
    const serveTo = servingTo.value;
    // Record server's X position for wrong court check
    serveFromX = serveTo === 'player' ? refs.playerPos.x : refs.aiPos.x;
    // Ball starts from paddle position (on top of paddle)
    if (serveTo === 'player') {
      refs.ballPos.set(refs.playerPos.x + 0.25, 0.45, refs.playerPos.z - 0.15);
    } else {
      refs.ballPos.set(refs.aiPos.x + 0.25, 0.45, refs.aiPos.z + 0.15);
    }

    // Aim toward opponent's side (past kitchen)
    const targetZ =
      serveTo === 'player'
        ? -(
            KITCHEN_DEPTH +
            0.5 +
            Math.random() * (COURT_LENGTH / 2 - KITCHEN_DEPTH - 1)
          )
        : KITCHEN_DEPTH +
          0.5 +
          Math.random() * (COURT_LENGTH / 2 - KITCHEN_DEPTH - 1);

    // Serve direction based on player movement direction
    let targetX: number;
    if (serveTo === 'player') {
      // Player serve: use actual velocity (momentum) to aim
      // This captures movement even if player stopped pressing keys to hit serve
      const moveX = THREE.MathUtils.clamp(
        playerCurrentVel.x / PLAYER_MAX_SPEED,
        -1,
        1,
      );
      // Base target near center, bias by movement direction
      targetX = (Math.random() - 0.5) * 0.6 + moveX * 2.5;
      // Serve magnet: bias target toward correct diagonal court based on difficulty
      const cfg = AI_CONFIGS[difficulty.value];
      if (cfg.playerMagnet > 0) {
        const playerScoreVal = playerScore.value;
        const serveRight = playerScoreVal % 2 === 0;
        // Player on right → serve to left (diagonal), and vice versa
        const correctCourtX = serveRight
          ? -(COURT_WIDTH / 2 - 1) // serve to left court corner
          : COURT_WIDTH / 2 - 1; // serve to right court corner
        targetX = THREE.MathUtils.lerp(
          targetX,
          correctCourtX,
          cfg.playerMagnet,
        );
      }
      // Clamp to court width
      targetX = THREE.MathUtils.clamp(
        targetX,
        -(COURT_WIDTH / 2 - 0.5),
        COURT_WIDTH / 2 - 0.5,
      );
    } else {
      // AI serve: aim for correct service court (diagonal — opposite side from AI position)
      const aiRight = refs.aiPos.x > 0;
      targetX = aiRight
        ? -(0.5 + Math.random() * (COURT_WIDTH / 2 - 1)) // AI on right → serve to left
        : 0.5 + Math.random() * (COURT_WIDTH / 2 - 1); // AI on left → serve to right
    }

    // Authentic: show which court to serve to, but don't force it
    // Player can serve to wrong court and get faulted

    _tempTarget.set(targetX, 0.3, targetZ);
    computeBallisticVel(refs.ballPos, _tempTarget, NET_HEIGHT + 0.3, _tempVel);
    refs.ballVel.copy(_tempVel);

    // Swing animation for server
    if (serveTo === 'player') {
      refs.playerSwing = 1;
      refs.playerSwingDir = 1; // default right for serve
    } else {
      refs.aiSwing = 1;
      refs.aiSwingDir = 1;
    }

    lastHitBy = serveTo;
    rallyHitCount = 1; // serve = hit 1; return = 2; third shot = 3 (volleys allowed from 3rd on)
    bounceCountThisSide = 0;
    ballBouncedOnSide = false;
    ballClippedNet = false;
    currentSide = serveTo; // ball starts on server's side
    aiDinkRead = null;
    hostPlaySfx('serve');
    hostPlaySfx('paddleHit');
  }

  // In PvP, delay bounce-based faults on the guest's side to give guest collision
  // Delayed bounce fault: used as fallback for edge cases (back-wall, net-stuck, ball-stopped)
  // where the guest may not detect the fault via its bounce tracking.
  // For host's own faults, score immediately. For guest's side faults, delay to allow
  // guest's bounce-fault report to arrive first — the pendingBounceFault guard prevents double-scoring.
  function delayedBounceFault(
    forWhom: 'player' | 'ai',
    reason: string,
    faultOnGuest: boolean,
  ) {
    if (!isPvP.value || !faultOnGuest) {
      scorePoint(forWhom, reason);
      return;
    }
    // Cancel any existing pending bounce fault (shouldn't happen, but safety)
    if (pendingBounceFault?.timer) clearTimeout(pendingBounceFault.timer);
    // Delay by RTT estimate (min 150ms) to wait for guest bounce-fault report
    const delay = Math.max((p2p.opponentPing.value || 100) * 2, 150);
    pendingBounceFault = {
      forWhom,
      reason,
      timer: setTimeout(() => {
        if (pendingBounceFault) {
          const pf = pendingBounceFault;
          pendingBounceFault = null;
          scorePoint(pf.forWhom, pf.reason);
        }
      }, delay),
    };
  }

  // Cancel a pending bounce fault if a guest collision report proves the ball was
  // still in the air (hadn't bounced) at collision time.
  function cancelPendingBounceFault(guestBallY: number) {
    if (!pendingBounceFault) return false;
    // Ball was still above the bounce threshold — collision happened before bounce.
    // Use BALL_RADIUS (not BALL_RADIUS*2) to match the actual bounce detection threshold.
    if (guestBallY > BALL_RADIUS) {
      if (pendingBounceFault.timer) clearTimeout(pendingBounceFault.timer);
      pendingBounceFault = null;
      return true;
    }
    return false;
  }

  function scorePoint(forWhom: 'player' | 'ai', reason?: string) {
    const myName = PlayerProfile.state.firstName || '';
    const oppName = opponentName.value || '';
    const playerName = myName || 'You';
    const aiName = isPvP.value ? oppName || 'Opp' : 'AI';

    // Build personalized fault message from this device's perspective.
    // In PvP: host's 'player' = host, 'ai' = guest. Guest flips perspective.
    // A fault (reason present) means the non-scoring side made an error.
    let msg: string;
    if (reason) {
      // For 'In!' the label is the scorer (who hit the ball in), not the
      // faulting side (who didn't return). For all other faults (Out!, Net!,
      // etc.) the label is the faulting side (who made the error).
      const labelSide =
        reason === 'In!' ? forWhom : forWhom === 'player' ? 'ai' : 'player';
      // From host's perspective: 'player' = host, 'ai' = guest
      // From guest's perspective: 'player' = host (opponent), 'ai' = guest (self)
      const faultLabel = isGuest.value
        ? labelSide === 'ai'
          ? 'You'
          : oppName || 'Opp'
        : labelSide === 'player'
          ? 'You'
          : aiName;
      msg = `${faultLabel}: ${reason}`;
    } else {
      msg =
        forWhom === 'player' ? `${playerName} scores!` : `${aiName} scores!`;
    }

    if (reason) {
      // Harsh error sound when player faults (AI gets the point)
      // Softer sound when AI faults (player gets the point)
      if (forWhom === 'ai') {
        hostPlaySfx('fault');
      } else {
        hostPlaySfx('pointScored');
      }
    } else {
      hostPlaySfx('pointScored');
    }

    if (rules.value === 'authentic') {
      // Side-out scoring: only the server scores
      if (forWhom === server.value) {
        if (forWhom === 'player') {
          playerScore.value++;
        } else {
          aiScore.value++;
        }
        lastPointMsg.value = msg;
        scoringSide.value = forWhom;
      } else {
        // Side out — serve passes to rally winner, no point scored
        lastPointMsg.value = reason ? `${msg}\nSide Out` : 'Side Out';
        server.value = forWhom;
        scoringSide.value = forWhom;
      }
    } else {
      // Arcade: rally scoring
      if (forWhom === 'player') {
        playerScore.value++;
      } else {
        aiScore.value++;
      }
      lastPointMsg.value = msg;
      server.value = forWhom;
      scoringSide.value = forWhom;
    }

    if (playerScore.value >= WIN_SCORE) {
      winner.value = 'player';
      gameState.value = 'game-over';
      sound.win();
      if (isHost.value) {
        p2p.broadcastEvent({ type: 'game-over' });
      }
      return;
    }
    if (aiScore.value >= WIN_SCORE) {
      winner.value = 'ai';
      gameState.value = 'game-over';
      sound.lose();
      if (isHost.value) {
        p2p.broadcastEvent({ type: 'game-over' });
      }
      return;
    }

    gameState.value = 'point-scored';
    pointPauseTimer = POINT_PAUSE;
    // In PvP, host notifies guest of the fault reason for instant message display
    if (isHost.value && reason) {
      p2p.broadcastEvent({ type: 'fault-notify', data: reason, ss: forWhom });
    }
    // Arcade: serve alternates to rally winner. Authentic: serve stays with server if they scored, passes on side-out
    if (rules.value === 'arcade') {
      servingTo.value = forWhom === 'player' ? 'player' : 'ai';
    } else {
      servingTo.value = server.value;
    }
  }

  function updatePlayer(dt: number) {
    const maxSpeed = PLAYER_MAX_SPEED;
    const cfg = AI_CONFIGS[difficulty.value];
    const ps = playerSide.value; // 1 = z>0 half, -1 = z<0 half
    // Combine keyboard (boolean) and analog (joystick) inputs
    let dx = input.axisX;
    let dz = input.axisZ;
    if (input.left) dx -= 1;
    if (input.right) dx += 1;
    if (input.forward) dz -= 1;
    if (input.backward) dz += 1;
    // Clamp combined input to -1.2..1.2 (allows joystick boost)
    dx = THREE.MathUtils.clamp(dx, -1.2, 1.2);
    dz = THREE.MathUtils.clamp(dz, -1.2, 1.2);

    // Ball magnet: gently guide player toward ball X when ball is incoming
    // For guest (ps=-1), ball is incoming when ballVel.z < 0 (toward z<0)
    if (
      cfg.playerMagnet > 0 &&
      refs.ballVel.z * ps > 0 &&
      !servePending.value
    ) {
      // Predict where ball will be when it reaches player's Z
      const timeToPlayer = (refs.playerPos.z - refs.ballPos.z) / refs.ballVel.z;
      if (timeToPlayer > 0 && timeToPlayer < 2) {
        const predictedX = refs.ballPos.x + refs.ballVel.x * timeToPlayer;
        const xDiff = predictedX - refs.playerPos.x;
        dx = THREE.MathUtils.clamp(
          dx + xDiff * cfg.playerMagnet * 0.5,
          -1.2,
          1.2,
        );
      }
    }

    // Target velocity from input
    const targetVx = dx * maxSpeed;
    const targetVz = dz * maxSpeed;

    // Accelerate toward target velocity, decelerate with friction when no input
    const accelX = dx !== 0 ? PLAYER_ACCEL : PLAYER_FRICTION;
    const accelZ = dz !== 0 ? PLAYER_ACCEL : PLAYER_FRICTION;
    playerCurrentVel.x = THREE.MathUtils.damp(
      playerCurrentVel.x,
      targetVx,
      accelX,
      dt,
    );
    playerCurrentVel.z = THREE.MathUtils.damp(
      playerCurrentVel.z,
      targetVz,
      accelZ,
      dt,
    );

    // Track previous position for velocity
    prevPlayerPos.copy(refs.playerPos);

    refs.playerPos.x += playerCurrentVel.x * dt;
    refs.playerPos.z += playerCurrentVel.z * dt;

    // Jump physics
    if (input.jump && refs.playerPos.y <= 0.01) {
      playerJumpVel = JUMP_VELOCITY;
    }
    input.jump = false; // consume jump request

    if (playerJumpVel !== 0 || refs.playerPos.y > 0) {
      playerJumpVel += JUMP_GRAVITY * dt;
      refs.playerPos.y += playerJumpVel * dt;
      if (refs.playerPos.y <= 0) {
        refs.playerPos.y = 0;
        playerJumpVel = 0;
      }
    }

    // Compute velocity (for impact-force physics)
    if (dt > 0) {
      playerVel.subVectors(refs.playerPos, prevPlayerPos).divideScalar(dt);
      const rawMoveZ = THREE.MathUtils.clamp(
        playerVel.z / PLAYER_MAX_SPEED,
        -1,
        1,
      );
      const rawMoveDir = THREE.MathUtils.clamp(
        playerVel.x / PLAYER_MAX_SPEED,
        -1,
        1,
      );
      refs.playerMoveZ = THREE.MathUtils.damp(
        refs.playerMoveZ,
        rawMoveZ,
        10,
        dt,
      );
      refs.playerMoveDir = THREE.MathUtils.damp(
        refs.playerMoveDir,
        rawMoveDir,
        10,
        dt,
      );
    }

    // Clamp to player's half — always blocked by net wall
    refs.playerPos.x = THREE.MathUtils.clamp(
      refs.playerPos.x,
      -CLAMP_HALF_W,
      CLAMP_HALF_W,
    );
    // Player's half boundaries: net wall at 0.3*ps, baseline at CLAMP_BACK*ps
    // For host (ps=1): z in [0.3, CLAMP_BACK] — z>0 half
    // For guest (ps=-1): z in [-CLAMP_BACK, -0.3] — z<0 half
    const netZ = 0.3 * ps;
    const backZ = CLAMP_BACK * ps;
    refs.playerPos.z = THREE.MathUtils.clamp(
      refs.playerPos.z,
      Math.min(netZ, backZ),
      Math.max(netZ, backZ),
    );

    // Swing animation decay
    refs.playerSwing = Math.max(0, refs.playerSwing - dt * 3);

    // Compute reach toward ball and paddle angle
    if (!servePending.value && refs.ballVel.z * ps > 0) {
      const distToBall = refs.playerPos.distanceTo(refs.ballPos);
      const reachRange = 2.5;
      const targetReach = THREE.MathUtils.clamp(
        1 - distToBall / reachRange,
        0,
        1,
      );
      refs.playerReach = THREE.MathUtils.damp(
        refs.playerReach,
        targetReach,
        8,
        dt,
      );
      const dxBall = refs.ballPos.x - refs.playerPos.x;
      const dzBall = refs.ballPos.z - refs.playerPos.z;
      refs.playerPaddleAngle = Math.atan2(dxBall, dzBall);
    } else {
      refs.playerReach = THREE.MathUtils.damp(refs.playerReach, 0, 8, dt);
    }
  }

  function updateAI(dt: number) {
    const cfg = AI_CONFIGS[difficulty.value];

    // Track previous position for velocity
    prevAiPos.copy(refs.aiPos);

    // Default: hold position behind baseline (safe position)
    let aiTargetZ = -COURT_LENGTH / 2 - 0.8;

    // If ball already bounced on AI side, go hit it
    if (ballBouncedOnSide && refs.ballPos.z < 0) {
      // Evaluate dink read once (persistent), not every frame
      if (aiDinkRead === null) {
        aiDinkRead = Math.random() < cfg.accuracy;
      }
      if (aiDinkRead) {
        // AI reads the dink — go directly to ball position
        aiTargetX = refs.ballPos.x;
        aiTargetZ = refs.ballPos.z;
      } else {
        // AI fails to read — still goes toward ball but with positional error
        aiTargetX = refs.ballPos.x + (Math.random() - 0.5) * 1.5;
        aiTargetZ = refs.ballPos.z + (Math.random() - 0.5) * 0.5;
      }
    } else if (refs.ballVel.z < 0) {
      // Ball moving toward AI — use indicator's bounce prediction + simulate for height tracking
      aiReactionTimer -= dt;
      if (aiReactionTimer <= 0) {
        // Use the same bounce prediction as the trajectory indicator
        const bounceZ = refs.ballBouncePredict
          ? refs.ballBouncePredict.z
          : null;
        const bounceX = refs.ballBouncePredict ? refs.ballBouncePredict.x : 0;
        const willBounceInKitchen =
          bounceZ !== null && Math.abs(bounceZ) < KITCHEN_DEPTH;

        // Simulate trajectory for body height and hittable height tracking only
        let simY = refs.ballPos.y;
        let simVy = refs.ballVel.y;
        let simZ = refs.ballPos.z;
        let simX = refs.ballPos.x;
        const simVz = refs.ballVel.z;
        const simVx = refs.ballVel.x;
        let hittableZ: number | null = null;
        let hittableX = 0;
        let bodyHeightZ: number | null = null;
        for (let i = 0; i < 50; i++) {
          simY += simVy * 0.05;
          simVy += GRAVITY * 0.05;
          simZ += simVz * 0.05;
          simX += simVx * 0.05;
          if (bodyHeightZ === null && simY <= 1.2 && simZ < 0 && simVy < 0) {
            bodyHeightZ = simZ;
          }
          if (hittableZ === null && simY <= 1.2 && simY >= 0.3 && simZ < 0) {
            hittableZ = simZ;
            hittableX = simX;
          }
          if (simY < 0 || simZ < -COURT_LENGTH / 2) break;
        }

        if (!ballBouncedOnSide && rallyHitCount < 3) {
          // Double-bounce rule: must let ball bounce first
          // Position behind where ball reaches body height to avoid walking into it
          if (bounceZ !== null) {
            aiTargetX = bounceX;
            if (willBounceInKitchen) {
              // Dink into kitchen — wait at kitchen line
              aiTargetZ = -KITCHEN_DEPTH - 0.2;
            } else if (bodyHeightZ !== null) {
              // Ball descends to body height before bounce — stay behind that point
              // so ball passes over AI head, bounces in front, then AI moves in to hit
              aiTargetZ = bodyHeightZ - 0.8;
            } else {
              // Ball stays low — position behind bounce spot
              aiTargetZ = bounceZ - 0.5;
            }
          } else {
            // Ball won't bounce on AI side (going out) — stay behind baseline
            aiTargetZ = -COURT_LENGTH / 2 - 0.8;
          }
        } else {
          // Past double-bounce rule — can volley or hit after bounce
          if (hittableZ !== null && (bounceZ === null || hittableZ < bounceZ)) {
            // Ball reaches hittable height before bouncing — go volley it
            aiTargetX = hittableX;
            aiTargetZ = hittableZ;
          } else if (bounceZ !== null) {
            // Ball will bounce first — go to bounce spot, wait, then hit after
            aiTargetX = bounceX;
            aiTargetZ = bounceZ;
          } else {
            aiTargetZ = -COURT_LENGTH / 2 - 0.8;
          }
        }

        // Add tracking error based on accuracy and magnet
        const errorScale = (1 - cfg.accuracy) * (1 - cfg.aiMagnet);
        aiTargetX += (Math.random() - 0.5) * errorScale * 2.0;

        aiReactionTimer = cfg.reactionDelay;
      }

      // PER-FRAME SAFETY: during double-bounce rule, prevent AI from moving forward into ball
      // This runs every frame, not just when reaction timer fires
      if (!ballBouncedOnSide && rallyHitCount < 3) {
        // If ball is above ground level and moving toward AI, don't let AI move forward
        if (refs.ballPos.y > 0.3 && refs.ballVel.z < 0) {
          // Clamp target Z to not be forward of current position (only allow backward/sideways)
          if (aiTargetZ > refs.aiPos.z) {
            aiTargetZ = refs.aiPos.z; // hold current Z, don't move forward
          }
        }
        // Dodge ball only when it's truly about to hit AI body
        const distZ = Math.abs(refs.aiPos.z - refs.ballPos.z);
        const distX = Math.abs(refs.aiPos.x - refs.ballPos.x);
        if (
          distZ < 0.8 &&
          distX < 0.8 &&
          refs.ballPos.y > 0.3 &&
          refs.ballPos.y < 1.2
        ) {
          // Push AI behind the ball
          aiTargetZ = refs.ballPos.z - 1.0;
          // Dodge in X away from ball
          const xDiff = refs.aiPos.x - refs.ballPos.x;
          aiTargetX = refs.aiPos.x + (xDiff >= 0 ? 0.8 : -0.8);
        }
      }
    } else if (refs.ballVel.z > 0 && refs.ballPos.z > 0) {
      // Ball on player's side moving away — drift toward neutral position
      aiTargetX *= 0.9; // ease toward center
      aiTargetZ = -COURT_LENGTH / 2 - 0.8; // back behind baseline
    }

    // Move toward target X with acceleration (but not during serve)
    // Speed boost when chasing a ball that bounced in the kitchen (dink recovery)
    const chasingDink = ballBouncedOnSide && refs.ballPos.z < 0;
    // Also boost when ball is about to bounce in kitchen and AI needs to close distance
    const approachingDink =
      !ballBouncedOnSide &&
      refs.ballVel.z < 0 &&
      refs.ballPos.z < 0 &&
      Math.abs(refs.ballPos.z) < KITCHEN_DEPTH + 1;
    const speedMul = chasingDink ? 1.8 : approachingDink ? 1.4 : 1;
    if (!servePending.value) {
      const targetVx = THREE.MathUtils.clamp(
        (aiTargetX - refs.aiPos.x) * 3,
        -cfg.speed * speedMul,
        cfg.speed * speedMul,
      );
      aiCurrentVel.x = THREE.MathUtils.damp(
        aiCurrentVel.x,
        targetVx,
        AI_ACCEL * speedMul,
        dt,
      );
      refs.aiPos.x += aiCurrentVel.x * dt;
    }

    // Move toward target Z with acceleration (forward/backward to intercept)
    if (!servePending.value) {
      const targetVz = THREE.MathUtils.clamp(
        (aiTargetZ - refs.aiPos.z) * 3,
        -cfg.speed * speedMul,
        cfg.speed * speedMul,
      );
      aiCurrentVel.z = THREE.MathUtils.damp(
        aiCurrentVel.z,
        targetVz,
        AI_ACCEL * speedMul,
        dt,
      );
      refs.aiPos.z += aiCurrentVel.z * dt;
    }

    // Clamp to AI's half — always blocked by net wall
    refs.aiPos.x = THREE.MathUtils.clamp(
      refs.aiPos.x,
      -CLAMP_HALF_W,
      CLAMP_HALF_W,
    );
    refs.aiPos.z = THREE.MathUtils.clamp(refs.aiPos.z, CLAMP_AI_BACK, -0.3);

    // Compute velocity
    if (dt > 0) {
      aiVel.subVectors(refs.aiPos, prevAiPos).divideScalar(dt);
      const rawAiMoveDir = THREE.MathUtils.clamp(
        aiVel.x / PLAYER_MAX_SPEED,
        -1,
        1,
      );
      const rawAiMoveZ = THREE.MathUtils.clamp(
        aiVel.z / PLAYER_MAX_SPEED,
        -1,
        1,
      );
      refs.aiMoveDir = THREE.MathUtils.damp(
        refs.aiMoveDir,
        rawAiMoveDir,
        10,
        dt,
      );
      refs.aiMoveZ = THREE.MathUtils.damp(refs.aiMoveZ, rawAiMoveZ, 10, dt);
    }

    // Swing animation decay
    refs.aiSwing = Math.max(0, refs.aiSwing - dt * 3);

    // Compute reach toward ball and paddle angle
    if (!servePending.value && refs.ballVel.z < 0) {
      const distToBall = refs.aiPos.distanceTo(refs.ballPos);
      const reachRange = 2.5;
      const targetReach = THREE.MathUtils.clamp(
        1 - distToBall / reachRange,
        0,
        1,
      );
      refs.aiReach = THREE.MathUtils.damp(refs.aiReach, targetReach, 8, dt);
      const dxBall = refs.ballPos.x - refs.aiPos.x;
      const dzBall = refs.ballPos.z - refs.aiPos.z;
      refs.aiPaddleAngle = Math.atan2(dxBall, dzBall);
    } else {
      refs.aiReach = THREE.MathUtils.damp(refs.aiReach, 0, 8, dt);
    }
  }

  function tryHit(
    pos: THREE.Vector3,
    ballPos: THREE.Vector3,
    ballVel: THREE.Vector3,
    isPlayer: boolean,
    confirmed = false,
  ): boolean {
    // 3D body volume collision — player body + head + paddle reach
    // Paddle reach extends based on how far paddle is reaching toward ball
    const reach = isPlayer ? refs.playerReach : refs.aiReach;
    const bodyHalfWidth = 0.35 + reach * 0.3; // paddle extends wider when reaching
    const bodyHeightMin = 0.0;
    const bodyHeightMax = 1.2; // top of head
    const bodyHalfDepth = 0.35 + reach * 0.3; // paddle extends deeper when reaching

    // Skip collision check if confirmed by guest's local detection (split-authority).
    // The ball may have already moved past on the host's simulation by the time
    // the guest's collision report arrives due to network latency.
    if (!confirmed) {
      const dx = Math.abs(pos.x - ballPos.x);
      const dz = Math.abs(pos.z - ballPos.z);
      const dy = ballPos.y - pos.y; // relative to player's current height (jump)

      // Check if ball is within the player's 3D volume (body + paddle reach)
      if (
        dx > bodyHalfWidth ||
        dz > bodyHalfDepth ||
        dy < bodyHeightMin ||
        dy > bodyHeightMax
      ) {
        // Ball outside body volume — check paddle reach zone (extended forward)
        const paddleY = 0.55;
        const paddleReach = 0.6; // paddle extends forward
        const dyPaddle = Math.abs(paddleY - dy);
        if (dx > bodyHalfWidth || dz > paddleReach || dyPaddle > 0.5) {
          return false;
        }
      }
    }

    if (isPlayer && playerHitCooldown > 0) return false;
    if (!isPlayer && aiHitCooldown > 0) return false;

    // Direction check: only hit if ball is moving toward the hitter
    if (isPlayer && ballVel.z < 0) return false;
    if (!isPlayer && ballVel.z > 0) return false;

    // Receiver can't volley the serve — must let it bounce first
    if (rallyHitCount === 1 && !ballBouncedOnSide) {
      scorePoint(isPlayer ? 'ai' : 'player', 'Volley fault!');
      return true;
    }

    // Double-bounce rule: can't volley before 3rd shot (serve=1, return=2, third=3)
    const hitterSide = isPlayer ? 'player' : 'ai';
    if (!ballBouncedOnSide && rallyHitCount < 3 && currentSide === hitterSide) {
      // Volley fault — too early
      scorePoint(isPlayer ? 'ai' : 'player', 'Volley fault!');
      return true; // consume the hit
    }

    // Kitchen volley fault: if ball hasn't bounced and player is in kitchen
    if (!ballBouncedOnSide) {
      const z = pos.z;
      const inKitchen = isPlayer
        ? z > 0 && z < KITCHEN_DEPTH
        : z < 0 && z > -KITCHEN_DEPTH;
      if (inKitchen) {
        scorePoint(isPlayer ? 'ai' : 'player', 'Kitchen fault!');
        return true;
      }
    }

    // Aim at a target on the opponent's side
    const cfg = AI_CONFIGS[difficulty.value];
    // Error based on accuracy: (1 - accuracy) * max spread
    // Player error is minimal (skill-based), AI error scales with difficulty
    const errorRange = isPlayer ? 0.4 : (1 - cfg.accuracy) * 1.8;

    // Impact-force: based on player movement direction and speed
    // Movement direction influences where the ball goes
    const vel = isPlayer ? playerVel : aiVel;
    const maxSpeed = isPlayer
      ? PLAYER_MAX_SPEED
      : AI_CONFIGS[difficulty.value].speed;

    // Z movement (forward/backward) controls shot depth
    const approach = isPlayer ? -vel.z : vel.z;
    const moveRatioZ = THREE.MathUtils.clamp(approach / maxSpeed, 0, 1);

    // X movement (left/right) controls shot direction
    const sideMove = vel.x / maxSpeed; // -1 to 1

    // Dink depth: 0.5m past kitchen when standing, full depth when charging
    const maxDepth = COURT_LENGTH / 2 - KITCHEN_DEPTH - 0.5;
    const minDepth = 0.5;
    const depth = minDepth + moveRatioZ * (maxDepth - minDepth);

    // AI dink chance: sometimes hit short into the kitchen to force player to let it bounce
    let adjustedTargetZ: number;
    if (!isPlayer) {
      // Increase dink chance when player is standing still (vulnerable to kitchen dink)
      const playerSpeed = playerVel.length();
      const playerStanding = playerSpeed < 0.5;
      let dinkChance = cfg.dinkChance;
      if (playerStanding) dinkChance += cfg.dinkBonusStanding;
      if (Math.random() < dinkChance) {
        // Dink into kitchen: ball must bounce inside kitchen (0.3m to 1.8m past net)
        adjustedTargetZ = 0.3 + Math.random() * 1.5;
      } else {
        adjustedTargetZ = KITCHEN_DEPTH + depth;
      }
    } else {
      // Player dink: when standing still, shot tends to go short into AI kitchen
      const playerSpeed = playerVel.length();
      const isStanding = playerSpeed < 0.5;
      if (isStanding && Math.random() < 0.3) {
        // Dink into AI kitchen: ball must bounce inside kitchen (0.3m to 1.8m past net)
        adjustedTargetZ = -(0.3 + Math.random() * 1.5);
      } else {
        adjustedTargetZ = -(KITCHEN_DEPTH + depth);
      }
    }

    // X target: base random spread + bias from movement direction
    const baseXRange = 1.0 + moveRatioZ * (COURT_WIDTH - 2);
    // Movement bias: up to ±2m in the direction the player is moving
    const moveBias = sideMove * 2.0;
    let targetXAdj: number;

    if (!isPlayer && cfg.targetBias > 0) {
      // AI: bias toward opposite side of player based on difficulty
      const playerXSide = refs.playerPos.x > 0 ? -1 : 1;
      const targetCenter = playerXSide * cfg.targetBias;
      targetXAdj =
        targetCenter +
        (Math.random() - 0.5) * 2.0 +
        (Math.random() - 0.5) * errorRange;
    } else {
      targetXAdj =
        (Math.random() - 0.5) * baseXRange +
        moveBias +
        (Math.random() - 0.5) * errorRange;
    }

    _tempTarget.set(targetXAdj, 0.3, adjustedTargetZ);
    // Net clearance — dinks have variable clearance (sometimes hits net = fault)
    const isDink = Math.abs(adjustedTargetZ) < KITCHEN_DEPTH;
    let clearMargin: number;
    let power: number;
    if (isDink) {
      // Dink: chance of low clearance (may hit net = fault)
      // AI net fault scales by difficulty; player fixed at 15%
      const netFaultChance = isPlayer ? 0.15 : cfg.netFaultChance;
      if (Math.random() < netFaultChance) {
        clearMargin = -0.05; // below net height — will clip net
      } else {
        clearMargin = 0.15 + Math.random() * 0.2; // 0.15–0.35m clearance
      }
      power = 0.6;
    } else {
      clearMargin = 0.05;
      power = 1;
    }
    computeBallisticVel(
      ballPos,
      _tempTarget,
      Math.max(NET_HEIGHT + clearMargin, 0.1),
      ballVel,
      power,
    );

    // Update rally state
    lastHitBy = isPlayer ? 'player' : 'ai';
    rallyHitCount++;
    bounceCountThisSide = 0;
    ballBouncedOnSide = false;
    ballClippedNet = false;
    currentSide = isPlayer ? 'ai' : 'player';
    aiDinkRead = null;

    if (isPlayer) {
      playerHitCooldown = HIT_COOLDOWN;
      refs.playerSwing = 1;
      refs.playerSwingDir = playerVel.x >= 0 ? 1 : -1;
    } else {
      aiHitCooldown = HIT_COOLDOWN;
      refs.aiSwing = 1;
      refs.aiSwingDir = aiVel.x >= 0 ? 1 : -1;
    }

    hostPlaySfx('paddleHit');
    return true;
  }

  // Compute velocity so the ball travels from `from` to `to` and clears `clearY` at the net (z=0)
  function computeBallisticVel(
    from: THREE.Vector3,
    to: THREE.Vector3,
    clearY: number,
    out: THREE.Vector3,
    power: number = 1,
  ): THREE.Vector3 {
    const dz = to.z - from.z;
    const dx = to.x - from.x;
    const distZ = Math.abs(dz);
    const g = GRAVITY;

    // Choose flight time based on distance; higher power = shorter time (faster, flatter)
    // Pickleball is flat and fast — keep T short
    const T = THREE.MathUtils.clamp(distZ / 7, 0.4, 1.2) / power;

    // Compute vy so ball reaches to.y at time T
    let vy = (to.y - from.y - 0.5 * g * T * T) / T;

    // Check net clearance: time to reach net (z=0)
    const vz = dz / T;
    const tNet = Math.abs(vz) > 0.001 ? -from.z / vz : 0;

    if (Math.abs(tNet) > 0.001 && tNet > 0 && tNet < T) {
      const yNet = from.y + vy * tNet + 0.5 * g * tNet * tNet;
      if (yNet < clearY) {
        vy = (clearY - from.y - 0.5 * g * tNet * tNet) / tNet;
      }
    }

    const vx = dx / T;
    const finalVz = dz / T;

    // Pickleball: minimal upward velocity, flat shots
    vy = Math.max(vy, 0.5);

    out.set(vx, vy, finalVz);
    return out;
  }

  // Player triggers serve manually
  function triggerServe() {
    if (isPvP.value) {
      if (isGuest.value) {
        // Guest sends serve trigger to host (only when it's guest's turn)
        if (servePending.value && servingTo.value === 'ai') {
          p2p.broadcastInput({
            ax: input.axisX,
            az: input.axisZ,
            sv: true,
            gn: PlayerProfile.state.firstName || '',
          });
        }
        return;
      }
      // Host: serve normally for player, remote serve handled in onInputReceived
      if (servePending.value && servingTo.value === 'player') {
        // Snap player back to serve position (may have drifted forward while triggering serve)
        refs.playerPos.z = servePosZ;
        if (refs.playerPos.z < COURT_LENGTH / 2) {
          scorePoint('ai', 'Foot fault!');
          servePending.value = false;
          return;
        }
        servePending.value = false;
        doServe();
      }
      return;
    }
    if (servePending.value && servingTo.value === 'player') {
      // Snap player back to serve position (may have drifted forward while triggering serve)
      refs.playerPos.z = servePosZ;
      // Fault if server is inside the court when serving
      if (refs.playerPos.z < COURT_LENGTH / 2) {
        scorePoint('ai', 'Foot fault!');
        servePending.value = false;
        return;
      }
      servePending.value = false;
      doServe();
    }
  }

  function updateBall(dt: number) {
    // If serve is pending, ball stays with the server (held by player)
    if (servePending.value) {
      if (servingTo.value === 'player') {
        // Ball held on top of paddle (paddle at +0.25x, 0.35y, +0.15z relative to player)
        refs.ballPos.set(
          refs.playerPos.x + 0.25,
          0.45,
          refs.playerPos.z - 0.15,
        );
      } else {
        // AI: ball held on top of paddle (paddle at +0.25x, 0.35y, +0.15z relative to AI)
        refs.ballPos.set(refs.aiPos.x + 0.25, 0.45, refs.aiPos.z + 0.15);
        // Skip auto-serve in PvP — guest triggers serve via input
        if (mode.value === 'pvp') return;
        // AI auto-serves after a short delay
        serveTimer += dt;
        if (serveTimer >= 0.8) {
          // Fault if AI is inside the court when serving
          if (refs.aiPos.z > -COURT_LENGTH / 2) {
            scorePoint('player', 'Foot fault!');
            servePending.value = false;
            return;
          }
          servePending.value = false;
          doServe();
        }
      }
      return;
    }

    // Gravity
    refs.ballVel.y += GRAVITY * dt;

    // Track previous z for net-crossing detection (tunneling)
    const prevBallZ = refs.ballPos.z;

    // Move
    refs.ballPos.x += refs.ballVel.x * dt;
    refs.ballPos.y += refs.ballVel.y * dt;
    refs.ballPos.z += refs.ballVel.z * dt;

    // Predict bounce point for trajectory indicator (throttled to ~20fps)
    bouncePredictTimer += dt;
    if (!servePending.value && refs.ballVel.lengthSq() > 0.5) {
      if (bouncePredictTimer >= BOUNCE_PREDICT_INTERVAL) {
        bouncePredictTimer = 0;
        let simY = refs.ballPos.y;
        let simVy = refs.ballVel.y;
        let simZ = refs.ballPos.z;
        let simX = refs.ballPos.x;
        const simVz = refs.ballVel.z;
        const simVx = refs.ballVel.x;
        let found = false;
        for (let i = 0; i < 80; i++) {
          simY += simVy * 0.02;
          simVy += GRAVITY * 0.02;
          simZ += simVz * 0.02;
          simX += simVx * 0.02;
          if (
            simY <= BALL_RADIUS &&
            simZ > -HALF_COURT_L &&
            simZ < HALF_COURT_L
          ) {
            if (!refs.ballBouncePredict)
              refs.ballBouncePredict = new THREE.Vector3();
            refs.ballBouncePredict.set(simX, 0.02, simZ);
            found = true;
            break;
          }
          if (simY < -1 || simZ < -HALF_COURT_L - 2 || simZ > HALF_COURT_L + 2)
            break;
        }
        if (!found) {
          refs.ballBouncePredict = null;
        }
      }
    } else {
      refs.ballBouncePredict = null;
    }

    // Bounce off court
    if (refs.ballPos.y < BALL_RADIUS) {
      refs.ballPos.y = BALL_RADIUS;
      // Bounce height depends on impact speed: soft shots bounce normally, hard shots bounce less
      const impactSpeed = Math.abs(refs.ballVel.y);
      const restitution = THREE.MathUtils.clamp(
        0.7 - impactSpeed * 0.04,
        0.35,
        0.65,
      );
      refs.ballVel.y = -refs.ballVel.y * restitution;
      refs.ballVel.x *= 0.88;
      refs.ballVel.z *= 0.88;

      // Track bounce for rules
      bounceCountThisSide++;
      ballBouncedOnSide = true;
      hostPlaySfx('ballBounce');

      // Check if bounce is in or out of bounds
      const bounceOutX = Math.abs(refs.ballPos.x) > HALF_COURT_W;
      const bounceOutZ = Math.abs(refs.ballPos.z) > HALF_COURT_L;
      const bounceIsOut = bounceOutX || bounceOutZ;

      // In PvP, host scores faults on its own side immediately via scorePoint.
      // For guest's side faults, host uses delayedBounceFault as a fallback:
      //   - Guest's bounce-fault report should arrive first → cancels pendingBounceFault → scores immediately
      //   - If guest's report is lost/delayed → host's delayed fallback fires after RTT×2
      // In AI mode, host handles all faults immediately.
      const hostOwnsFaults = !isPvP.value || currentSide === 'player';

      // If a bounce fault is already pending (delayed for guest report),
      // don't process further bounces — let the timer fire
      if (pendingBounceFault) return;

      // First bounce during rally: call out if clearly OOB
      if (rallyHitCount > 1 && bounceCountThisSide === 1 && bounceIsOut) {
        const faultBy = lastHitBy;
        if (faultBy) {
          const scorer = faultBy === 'player' ? 'ai' : 'player';
          if (hostOwnsFaults) {
            scorePoint(scorer, 'Out!');
          } else {
            delayedBounceFault(scorer, 'Out!', true);
          }
        }
        return;
      }

      // Second bounce = opponent didn't return
      if (rallyHitCount > 1 && bounceCountThisSide >= 2) {
        if (ballClippedNet) {
          // Ball clipped net then bounced twice — fault the hitter (lastHitBy), not the receiver
          const faultBy = lastHitBy;
          if (faultBy) {
            const scorer = faultBy === 'player' ? 'ai' : 'player';
            if (hostOwnsFaults) {
              scorePoint(scorer, 'Net!');
            } else {
              delayedBounceFault(scorer, 'Net!', true);
            }
          }
        } else {
          const faultSide = currentSide;
          if (faultSide) {
            const scorer = faultSide === 'player' ? 'ai' : 'player';
            if (hostOwnsFaults) {
              scorePoint(scorer, 'In!');
            } else {
              delayedBounceFault(scorer, 'In!', true);
            }
          }
        }
        return;
      }

      // Serve-specific checks — only on FIRST bounce
      if (rallyHitCount === 1 && bounceCountThisSide === 1) {
        const serverSide = lastHitBy;
        if (!serverSide) return;
        const opponentSide = serverSide === 'player' ? 'ai' : 'player';
        const faultOnGuest = !hostOwnsFaults;
        // Check if serve landed on server's own side (didn't cross net)
        const onServerSide =
          serverSide === 'player' ? refs.ballPos.z > 0 : refs.ballPos.z < 0;
        if (onServerSide) {
          if (hostOwnsFaults) scorePoint(opponentSide, 'Short serve!');
          else delayedBounceFault(opponentSide, 'Short serve!', faultOnGuest);
          return;
        }
        // Check if serve landed out of bounds
        if (
          Math.abs(refs.ballPos.x) > HALF_COURT_W ||
          Math.abs(refs.ballPos.z) > HALF_COURT_L
        ) {
          if (hostOwnsFaults) scorePoint(opponentSide, 'Serve out!');
          else delayedBounceFault(opponentSide, 'Serve out!', faultOnGuest);
          return;
        }
        // Check if serve landed in kitchen
        const inKitchen =
          opponentSide === 'player'
            ? refs.ballPos.z > 0 && refs.ballPos.z < KITCHEN_DEPTH
            : refs.ballPos.z < 0 && refs.ballPos.z > -KITCHEN_DEPTH;
        if (inKitchen) {
          if (hostOwnsFaults) scorePoint(opponentSide, 'Serve into kitchen!');
          else
            delayedBounceFault(
              opponentSide,
              'Serve into kitchen!',
              faultOnGuest,
            );
          return;
        }
        // Serve must land in correct service court (diagonal)
        // Score determines correct side: even = serve from right, odd = serve from left
        // Ball must land on opposite (diagonal) side
        {
          const score =
            serverSide === 'player' ? playerScore.value : aiScore.value;
          const correctServeRight = score % 2 === 0;
          // Fault if server served from wrong side
          const servedFromRight = serveFromX > 0;
          if (correctServeRight !== servedFromRight) {
            if (hostOwnsFaults) scorePoint(opponentSide, 'Wrong serving side!');
            else
              delayedBounceFault(
                opponentSide,
                'Wrong serving side!',
                faultOnGuest,
              );
            return;
          }
          // Ball must land diagonally (opposite side from server)
          const landedRight = refs.ballPos.x > 0;
          if (servedFromRight === landedRight) {
            if (hostOwnsFaults) scorePoint(opponentSide, 'Wrong court!');
            else delayedBounceFault(opponentSide, 'Wrong court!', faultOnGuest);
            return;
          }
        }
      }
    }

    // No side walls — ball going past sideline in the air = eventually out on bounce
    // (We let it fly; it will be caught by the OOB check on bounce or back-wall check)

    // Back walls — ball went past baseline
    // Only score after second bounce, or if ball is well past baseline (+2m) after first bounce
    // This gives player/AI a chance to hit the ball after the first bounce
    // Skip if a bounce fault is already pending
    if (!pendingBounceFault && rallyHitCount > 0 && ballBouncedOnSide) {
      const pastPlayerBack =
        refs.ballPos.z > HALF_COURT_L + 0.5 && refs.ballVel.z > 0;
      const pastAiBack =
        refs.ballPos.z < -HALF_COURT_L - 0.5 && refs.ballVel.z < 0;
      if (pastPlayerBack || pastAiBack) {
        // After second bounce — point is over
        if (bounceCountThisSide >= 2) {
          if (ballClippedNet) {
            const faultBy = lastHitBy;
            if (faultBy) {
              delayedBounceFault(
                faultBy === 'player' ? 'ai' : 'player',
                'Net!',
                faultBy === 'ai',
              );
            }
          } else {
            if (pastPlayerBack) delayedBounceFault('ai', 'In!', false);
            else delayedBounceFault('player', 'In!', true);
          }
          return;
        }
        // After first bounce — only call if ball is far past reach (+3m beyond baseline)
        if (
          refs.ballPos.z > HALF_COURT_L + 3 ||
          refs.ballPos.z < -HALF_COURT_L - 3
        ) {
          if (ballClippedNet) {
            const faultBy = lastHitBy;
            if (faultBy) {
              delayedBounceFault(
                faultBy === 'player' ? 'ai' : 'player',
                'Net!',
                faultBy === 'ai',
              );
            }
          } else {
            if (pastPlayerBack) delayedBounceFault('ai', 'In!', false);
            else delayedBounceFault('player', 'In!', true);
          }
          return;
        }
      }
    }

    // Net collision — ball hits net and doesn't cross (fault)
    // Detect both direct hits (abs(z) < 0.05) and tunneling (crossed z=0 between frames)
    // Skip if a bounce fault is already pending (don't double-score)
    const crossedNet = prevBallZ * refs.ballPos.z < 0; // sign change = crossed z=0
    const nearNet = Math.abs(refs.ballPos.z) < 0.05;
    if (
      !pendingBounceFault &&
      (nearNet || crossedNet) &&
      refs.ballPos.y < NET_HEIGHT
    ) {
      // Check if ball is moving fast enough to still cross
      const speedTowardOpponent = Math.abs(refs.ballVel.z);
      if (speedTowardOpponent < 1.0) {
        // Ball stuck in net — fault by the last hitter
        // Ball moving toward player (z>0) = AI hit it = player's point
        // Ball moving toward AI (z<0) = player hit it = AI's point
        if (refs.ballVel.z > 0) {
          delayedBounceFault('player', 'Net!', false);
        } else {
          delayedBounceFault('ai', 'Net!', true);
        }
        return;
      }
      // Ball clips net — reduce velocity but let it continue
      refs.ballVel.z *= 0.5;
      refs.ballVel.y *= 0.5;
      ballClippedNet = true;
      hostPlaySfx('netHit');
    }

    // Ball stopped on same side — same as "In!" (opponent hit it in, this side didn't return)
    // But if ball clipped the net, fault the hitter (lastHitBy) with "Net!"
    // Only fire after second bounce — after first bounce the receiver may still legally hit it.
    // Skip if a bounce fault is already pending
    if (!pendingBounceFault && ballBouncedOnSide && bounceCountThisSide >= 2) {
      const speedSq = refs.ballVel.lengthSq();
      if (speedSq < 0.25 && refs.ballPos.y < 0.15) {
        if (ballClippedNet) {
          const faultBy = lastHitBy;
          if (faultBy) {
            delayedBounceFault(
              faultBy === 'player' ? 'ai' : 'player',
              'Net!',
              faultBy === 'ai',
            );
          }
        } else {
          if (refs.ballPos.z > 0) {
            delayedBounceFault('ai', 'In!', false);
          } else {
            delayedBounceFault('player', 'In!', true);
          }
        }
        return;
      }
    }

    // Track which side the ball is on
    const newSide: 'player' | 'ai' = refs.ballPos.z > 0 ? 'player' : 'ai';
    if (currentSide !== newSide) {
      currentSide = newSide;
      bounceCountThisSide = 0;
      ballBouncedOnSide = false;
      aiDinkRead = null;
    }

    // Try hits — enforce pickleball rules (volley fault if ball hits body before bounce)
    if (refs.ballPos.z > 0) {
      tryHit(refs.playerPos, refs.ballPos, refs.ballVel, true);
    } else if (!isPvP.value) {
      // AI mode: host runs collision detection for AI side
      // In PvP: guest detects its own collisions and reports via 'fault' event
      const ballIsGoingOut = willBallLandOut();
      if (!ballIsGoingOut) {
        tryHit(refs.aiPos, refs.ballPos, refs.ballVel, false);
      }
    }
  }

  // Predict if the ball will land out of bounds on AI's side (only before first bounce)
  function willBallLandOut(): boolean {
    if (refs.ballVel.z >= 0) return false; // not moving toward AI
    if (ballBouncedOnSide) return false; // already bounced — ball is in play, go hit it
    // Use the bounce prediction if available (avoids redundant simulation)
    if (refs.ballBouncePredict) {
      return (
        Math.abs(refs.ballBouncePredict.x) > HALF_COURT_W ||
        Math.abs(refs.ballBouncePredict.z) > HALF_COURT_L
      );
    }
    // Fallback: simulate if no prediction available
    let simY = refs.ballPos.y;
    let simVy = refs.ballVel.y;
    let simX = refs.ballPos.x;
    let simZ = refs.ballPos.z;
    const simVx = refs.ballVel.x;
    const simVz = refs.ballVel.z;
    for (let i = 0; i < 80; i++) {
      simY += simVy * 0.03;
      simVy += GRAVITY * 0.03;
      simX += simVx * 0.03;
      simZ += simVz * 0.03;
      if (simY <= BALL_RADIUS && simZ < 0) {
        return Math.abs(simX) > HALF_COURT_W || Math.abs(simZ) > HALF_COURT_L;
      }
      if (simY < 0) return false;
    }
    return false;
  }

  // --- Gamepad support ---
  let gamepadIndex: number | null = null;
  let prevGamepadButtons: boolean[] = [];

  function onGamepadConnected(e: GamepadEvent) {
    gamepadIndex = e.gamepad.index;
  }

  function onGamepadDisconnected(e: GamepadEvent) {
    if (gamepadIndex === e.gamepad.index) {
      gamepadIndex = null;
      prevGamepadButtons = [];
      setAxis(0, 0);
    }
  }

  function pollGamepad() {
    const pads = navigator.getGamepads();

    // Auto-detect gamepad if not already tracked
    if (gamepadIndex === null) {
      for (let i = 0; i < pads.length; i++) {
        if (pads[i]) {
          gamepadIndex = i;
          break;
        }
      }
      if (gamepadIndex === null) return;
    }

    const gp = pads[gamepadIndex];
    if (!gp) {
      gamepadIndex = null;
      setAxis(0, 0);
      return;
    }

    // Left stick → axis movement (same as virtual joystick)
    const lx = gp.axes[0] || 0;
    const ly = gp.axes[1] || 0;
    // Right stick → same axis movement
    const rx = gp.axes[2] || 0;
    const ry = gp.axes[3] || 0;
    const deadZone = 0.15;

    // Combine both sticks — whichever has more input wins
    let axisX = 0;
    let axisZ = 0;
    let stickActive = false;

    const lMag = Math.hypot(lx, ly);
    const rMag = Math.hypot(rx, ry);

    if (lMag >= rMag) {
      if (lMag > deadZone) {
        axisX = Math.abs(lx) < deadZone ? 0 : lx;
        axisZ = Math.abs(ly) < deadZone ? 0 : ly;
        stickActive = true;
      }
    } else {
      if (rMag > deadZone) {
        axisX = Math.abs(rx) < deadZone ? 0 : rx;
        axisZ = Math.abs(ry) < deadZone ? 0 : ry;
        stickActive = true;
      }
    }

    // D-pad as fallback (buttons 12-15) — combine for diagonal movement
    if (gp.buttons[12]?.pressed) {
      axisZ = -1;
      stickActive = true;
    }
    if (gp.buttons[13]?.pressed) {
      axisZ = 1;
      stickActive = true;
    }
    if (gp.buttons[14]?.pressed) {
      axisX = -1;
      stickActive = true;
    }
    if (gp.buttons[15]?.pressed) {
      axisX = 1;
      stickActive = true;
    }

    // Set axis from gamepad — reset to zero when nothing is active
    // so the player stops moving when the controller is released
    if (stickActive) {
      setAxis(axisX, axisZ);
    } else {
      setAxis(0, 0);
    }

    // If first poll (e.g. just entered playing state), sync button state
    // to avoid false "justPressed" from buttons held during menu navigation
    if (prevGamepadButtons.length === 0) {
      prevGamepadButtons = gp.buttons.map((b) => b.pressed);
      return;
    }

    // Button press detection (edge-triggered)
    const curButtons = gp.buttons.map((b) => b.pressed);
    const justPressed = (idx: number) =>
      curButtons[idx] && !prevGamepadButtons[idx];

    // A / X (button 0) → serve
    if (justPressed(0)) {
      triggerServe();
    }
    // B / Circle (button 1) → jump
    if (justPressed(1)) {
      triggerJump();
    }
    // Start (button 9) → pause/resume
    if (justPressed(9)) {
      if (gameState.value === 'paused') {
        resumeGame();
      } else if (
        gameState.value === 'playing' ||
        gameState.value === 'point-scored'
      ) {
        pauseGame();
      }
    }

    prevGamepadButtons = curButtons;
  }

  // Button-only poll for paused state (no movement, just Start to resume)
  function pollGamepadButtons() {
    const pads = navigator.getGamepads();

    if (gamepadIndex === null) {
      for (let i = 0; i < pads.length; i++) {
        if (pads[i]) {
          gamepadIndex = i;
          break;
        }
      }
      if (gamepadIndex === null) return;
    }

    const gp = pads[gamepadIndex];
    if (!gp) {
      gamepadIndex = null;
      return;
    }

    if (prevGamepadButtons.length === 0) {
      prevGamepadButtons = gp.buttons.map((b) => b.pressed);
      return;
    }

    const curButtons = gp.buttons.map((b) => b.pressed);
    const justPressed = (idx: number) =>
      curButtons[idx] && !prevGamepadButtons[idx];

    // Start (button 9) → resume
    if (justPressed(9)) {
      resumeGame();
    }

    prevGamepadButtons = curButtons;
  }

  // PvP host: apply guest's remote input to opponent (aiPos) using same physics as player
  function updateRemotePlayer(dt: number) {
    prevAiPos.copy(refs.aiPos);

    // Use remote input instead of AI logic
    let dx = THREE.MathUtils.clamp(remoteInput.ax, -1.2, 1.2);
    const dz = THREE.MathUtils.clamp(remoteInput.az, -1.2, 1.2);

    // Apply same ball magnet as updatePlayer so host's position for guest
    // matches the guest's local prediction (which includes magnet)
    const cfg = AI_CONFIGS[difficulty.value];
    if (
      cfg.playerMagnet > 0 &&
      refs.ballVel.z < 0 && // ball incoming toward guest (z<0 side)
      !servePending.value
    ) {
      const timeToGuest = (refs.aiPos.z - refs.ballPos.z) / refs.ballVel.z;
      if (timeToGuest > 0 && timeToGuest < 2) {
        const predictedX = refs.ballPos.x + refs.ballVel.x * timeToGuest;
        const xDiff = predictedX - refs.aiPos.x;
        dx = THREE.MathUtils.clamp(
          dx + xDiff * cfg.playerMagnet * 0.5,
          -1.2,
          1.2,
        );
      }
    }

    const targetVx = dx * PLAYER_MAX_SPEED;
    const targetVz = dz * PLAYER_MAX_SPEED;
    const accelX = dx !== 0 ? PLAYER_ACCEL : PLAYER_FRICTION;
    const accelZ = dz !== 0 ? PLAYER_ACCEL : PLAYER_FRICTION;
    aiCurrentVel.x = THREE.MathUtils.damp(aiCurrentVel.x, targetVx, accelX, dt);
    aiCurrentVel.z = THREE.MathUtils.damp(aiCurrentVel.z, targetVz, accelZ, dt);
    refs.aiPos.x += aiCurrentVel.x * dt;
    refs.aiPos.z += aiCurrentVel.z * dt;

    // Jump physics (remote player)
    if (remoteInput.jump && refs.aiPos.y <= 0.01) {
      remoteJumpVel = JUMP_VELOCITY;
    }
    remoteInput.jump = false; // consume jump request

    if (remoteJumpVel !== 0 || refs.aiPos.y > 0) {
      remoteJumpVel += JUMP_GRAVITY * dt;
      refs.aiPos.y += remoteJumpVel * dt;
      if (refs.aiPos.y <= 0) {
        refs.aiPos.y = 0;
        remoteJumpVel = 0;
      }
    }

    // Clamp to opponent's half — always blocked by net wall
    refs.aiPos.x = THREE.MathUtils.clamp(
      refs.aiPos.x,
      -CLAMP_HALF_W,
      CLAMP_HALF_W,
    );
    refs.aiPos.z = THREE.MathUtils.clamp(refs.aiPos.z, CLAMP_AI_BACK, -0.3);

    // Compute velocity for animation
    if (dt > 0) {
      aiVel.subVectors(refs.aiPos, prevAiPos).divideScalar(dt);
      refs.aiMoveDir = THREE.MathUtils.damp(
        refs.aiMoveDir,
        THREE.MathUtils.clamp(aiVel.x / PLAYER_MAX_SPEED, -1, 1),
        10,
        dt,
      );
      refs.aiMoveZ = THREE.MathUtils.damp(
        refs.aiMoveZ,
        THREE.MathUtils.clamp(aiVel.z / PLAYER_MAX_SPEED, -1, 1),
        10,
        dt,
      );
    }

    // Swing animation decay
    refs.aiSwing = Math.max(0, refs.aiSwing - dt * 3);

    // Compute reach toward ball and paddle angle
    if (!servePending.value && refs.ballVel.z < 0) {
      const distToBall = refs.aiPos.distanceTo(refs.ballPos);
      const targetReach = THREE.MathUtils.clamp(1 - distToBall / 2.5, 0, 1);
      refs.aiReach = THREE.MathUtils.damp(refs.aiReach, targetReach, 8, dt);
      refs.aiPaddleAngle = Math.atan2(
        refs.ballPos.x - refs.aiPos.x,
        refs.ballPos.z - refs.aiPos.z,
      );
    } else {
      refs.aiReach = THREE.MathUtils.damp(refs.aiReach, 0, 8, dt);
    }
  }

  // Guest-side fault detection: detect body/paddle collision AND bounce faults locally.
  // Uses side-authority pattern — guest is authoritative for faults on its own side (z < 0).
  // Reports all bounce faults (out, double-bounce, serve faults) to host for scoring.
  // Host processes collision reports via tryHit to determine outcome (good return, volley fault, kitchen fault).
  // Body hitbox expanded by 20% to compensate for ball interpolation lag (~150ms).
  function checkGuestFaults() {
    if (servePending.value) return;
    if (gameState.value !== 'playing') return;

    // --- Bounce tracking (guest's side = z < 0) ---
    const ballY = refs.ballPos.y;
    // Detect bounce: ball was above BALL_RADIUS and now at/below it
    if (
      guestPrevBallY < 999 &&
      guestPrevBallY > BALL_RADIUS &&
      ballY <= BALL_RADIUS
    ) {
      // Ball bounced — check which side
      const newSide: 'player' | 'ai' = refs.ballPos.z > 0 ? 'player' : 'ai';
      if (newSide !== guestCurrentSide) {
        guestCurrentSide = newSide;
        guestBounceCount = 1;
      } else {
        guestBounceCount++;
      }

      // Only report faults on guest's side (z < 0, which is 'ai' side from host's perspective)
      if (guestCurrentSide === 'ai' && !pendingFaultAck) {
        const bounceOutX = Math.abs(refs.ballPos.x) > HALF_COURT_W;
        const bounceOutZ = Math.abs(refs.ballPos.z) > HALF_COURT_L;
        const bounceIsOut = bounceOutX || bounceOutZ;

        // Serve-specific checks — only on FIRST bounce
        if (guestRallyHitCount === 1 && guestBounceCount === 1) {
          const serverSide = guestLastHitBy;
          if (serverSide) {
            // From guest's perspective: host is 'player', guest is 'ai'
            if (serverSide === 'player') {
              // Host served to guest's side — check serve faults
              // Check if serve landed out of bounds
              if (bounceIsOut) {
                p2p.broadcastEvent({ type: 'bounce-fault', data: 'serve-out' });
                guestPrevBallY = ballY;
                return;
              }
              // Check if serve landed in kitchen
              const inKitchen =
                refs.ballPos.z < 0 && refs.ballPos.z > -KITCHEN_DEPTH;
              if (inKitchen) {
                p2p.broadcastEvent({
                  type: 'bounce-fault',
                  data: 'serve-kitchen',
                });
                guestPrevBallY = ballY;
                return;
              }
              // Check wrong service court (diagonal rule)
              const score = playerScore.value; // host's score determines court
              const correctServeRight = score % 2 === 0;
              const servedFromRight = guestServeFromX > 0;
              if (correctServeRight !== servedFromRight) {
                p2p.broadcastEvent({
                  type: 'bounce-fault',
                  data: 'wrong-serving-side',
                });
                guestPrevBallY = ballY;
                return;
              }
              const landedRight = refs.ballPos.x > 0;
              if (servedFromRight === landedRight) {
                p2p.broadcastEvent({
                  type: 'bounce-fault',
                  data: 'wrong-court',
                });
                guestPrevBallY = ballY;
                return;
              }
            } else {
              // Guest served — ball should land on host's side (z > 0)
              // If it landed on guest's own side (z < 0), it's a short serve
              p2p.broadcastEvent({ type: 'bounce-fault', data: 'short-serve' });
              guestPrevBallY = ballY;
              return;
            }
          }
        }

        // First bounce during rally: out of bounds
        if (guestRallyHitCount > 1 && guestBounceCount === 1 && bounceIsOut) {
          p2p.broadcastEvent({ type: 'bounce-fault', data: 'out' });
          guestPrevBallY = ballY;
          return;
        }

        // Second bounce = guest didn't return
        if (guestRallyHitCount > 1 && guestBounceCount >= 2) {
          if (guestBallClippedNet) {
            p2p.broadcastEvent({ type: 'bounce-fault', data: 'net' });
          } else {
            p2p.broadcastEvent({ type: 'bounce-fault', data: 'in' });
          }
          guestPrevBallY = ballY;
          return;
        }
      }
    }
    guestPrevBallY = ballY;

    // --- Collision detection (ball moving toward guest) ---
    if (pendingFaultAck) return; // already sent a collision report, waiting for ack
    if (refs.ballVel.z >= 0) return;

    // Guest is on z < 0 side. Check body/paddle collision using same volume as tryHit,
    // expanded by 20% to account for interpolation lag.
    const reach = refs.playerReach;
    const lagTolerance = 1.2; // 20% expansion for interpolation lag
    const bodyHalfWidth = (0.35 + reach * 0.3) * lagTolerance;
    const bodyHalfDepth = (0.35 + reach * 0.3) * lagTolerance;
    const dx = Math.abs(refs.playerPos.x - refs.ballPos.x);
    const dz = Math.abs(refs.playerPos.z - refs.ballPos.z);
    const dy = refs.ballPos.y - refs.playerPos.y; // relative to player height (jump)

    // Check body volume
    const bodyHit =
      dx <= bodyHalfWidth && dz <= bodyHalfDepth && dy >= 0 && dy <= 1.2;

    if (bodyHit) {
      sendGuestFault('collision');
      return;
    }

    // Check paddle reach zone (extended forward)
    const paddleY = 0.55;
    const paddleReach = 0.6 * lagTolerance;
    const dyPaddle = Math.abs(paddleY - dy);
    const paddleHit =
      dx <= bodyHalfWidth && dz <= paddleReach && dyPaddle <= 0.5;

    if (paddleHit) {
      sendGuestFault('collision');
    }
  }

  // Send fault event to host with ack-based retry.
  // Guest sends { type: 'fault', data: faultType, ballY }, waits for { type: 'fault-ack' }.
  // ballY proves the ball was in the air (hadn't bounced) at collision time.
  // Retries up to 3 times with 500ms timeout.
  function sendGuestFault(faultType: string) {
    p2p.broadcastEvent({
      type: 'fault',
      data: faultType,
      ballY: refs.ballPos.y,
    });

    pendingFaultAck = {
      seq: 0, // seq is assigned by broadcastEvent, but we track retries locally
      type: faultType,
      ballY: refs.ballPos.y,
      retries: 0,
      timer: setTimeout(() => {
        retryGuestFault();
      }, 500),
    };
  }

  // Retry fault event if no ack received from host
  function retryGuestFault() {
    if (!pendingFaultAck) return;
    if (pendingFaultAck.retries >= 3) {
      // Give up — host likely disconnected or processing game-over
      pendingFaultAck = null;
      return;
    }
    pendingFaultAck.retries++;
    p2p.broadcastEvent({
      type: 'fault',
      data: pendingFaultAck.type,
      ballY: pendingFaultAck.ballY,
    });
    pendingFaultAck.timer = setTimeout(() => {
      retryGuestFault();
    }, 500);
  }

  // Handle fault-ack from host — clears pending fault retry
  function handleFaultAck() {
    if (pendingFaultAck?.timer) {
      clearTimeout(pendingFaultAck.timer);
    }
    pendingFaultAck = null;
  }

  // Flip host's lastPointMsg perspective for the guest.
  // Host sends "You: Out!" (host faulted) or "Jane: Out!" (guest faulted).
  // Guest needs: "John: Out!" (host faulted) or "You: Out!" (guest faulted).
  // hostName = host's name, guestName = guest's own name (as host sees it).
  function guestLpm(
    hostLpm: string,
    hostName: string,
    guestName: string,
  ): string {
    if (!hostLpm) return hostLpm;
    const hName = hostName || 'Opp';
    const gName = guestName || 'You';
    // Replace "You:" (host self) with host's name, and guest's name with "You:"
    let result = hostLpm.replace(/^You:/, '__SELF__');
    result = result.replace(new RegExp(`^${escapeRegExp(gName)}:`), 'You:');
    result = result.replace('__SELF__', `${hName}:`);
    // Also handle inline labels in side-out messages (e.g., "You: Out!\nSide Out")
    result = result.replace(/(?<=\n)You:/, '__SELF__');
    result = result.replace(
      new RegExp(`(?<=\\n)${escapeRegExp(gName)}:`),
      'You:',
    );
    result = result.replace('__SELF__', `${hName}:`);
    return result;
  }

  function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // PvP host: broadcast state to guest at 20Hz
  function broadcastStateToGuest(dt: number) {
    stateBroadcastTimer += dt;
    if (stateBroadcastTimer < STATE_BROADCAST_INTERVAL) return;
    stateBroadcastTimer = 0;

    p2p.broadcastState({
      pp: [refs.playerPos.x, refs.playerPos.y, refs.playerPos.z],
      ap: [refs.aiPos.x, refs.aiPos.y, refs.aiPos.z],
      bp: [refs.ballPos.x, refs.ballPos.y, refs.ballPos.z],
      bv: [refs.ballVel.x, refs.ballVel.y, refs.ballVel.z],
      ps: playerScore.value,
      as: aiScore.value,
      sv: server.value,
      sp: servePending.value,
      psw: refs.playerSwing,
      asw: refs.aiSwing,
      pr: refs.playerReach,
      ar: refs.aiReach,
      ppa: refs.playerPaddleAngle,
      apa: refs.aiPaddleAngle,
      pmd: refs.playerMoveDir,
      pmz: refs.playerMoveZ,
      amd: refs.aiMoveDir,
      amz: refs.aiMoveZ,
      bbp: refs.ballBouncePredict
        ? [
            refs.ballBouncePredict.x,
            refs.ballBouncePredict.y,
            refs.ballBouncePredict.z,
          ]
        : null,
      hn: PlayerProfile.state.firstName || '',
      gn: opponentName.value || 'Opp',
      pp2: playerPalette.value,
      ap2: aiPalette.value,
      lpm: lastPointMsg.value,
      sfx: sfxQueue.length > 0 ? sfxQueue.slice() : undefined,
      gs: gameState.value,
      ss: scoringSide.value ?? undefined,
      rhc: rallyHitCount,
      lhb: lastHitBy,
      sfx2: serveFromX,
      bcn: ballClippedNet,
    });
    sfxQueue.length = 0; // clear queue after broadcast
  }

  // PvP guest: interpolate state from host
  function interpolateGuestState(dt: number) {
    const buffer = p2p.getJitterBuffer();
    if (buffer.length === 0) {
      // No state received yet — extrapolate ball using last known velocity
      refs.ballVel.y += GRAVITY * dt;
      refs.ballPos.x += refs.ballVel.x * dt;
      refs.ballPos.y += refs.ballVel.y * dt;
      refs.ballPos.z += refs.ballVel.z * dt;
      return;
    }

    if (buffer.length === 1) {
      // Only one snapshot — snap directly
      const s1 = buffer[0];
      if (snapBallNextFrame) {
        refs.ballPos.set(s1.bp[0], s1.bp[1], s1.bp[2]);
        refs.ballVel.set(s1.bv[0], s1.bv[1], s1.bv[2]);
        snapBallNextFrame = false;
      }
      // Damp opponent toward host state
      refs.aiPos.x = THREE.MathUtils.damp(refs.aiPos.x, s1.pp[0], 10, dt);
      refs.aiPos.z = THREE.MathUtils.damp(refs.aiPos.z, s1.pp[2], 10, dt);
      // Sync opponent movement direction for animation
      refs.aiMoveDir = THREE.MathUtils.damp(refs.aiMoveDir, s1.pmd, 8, dt);
      refs.aiMoveZ = THREE.MathUtils.damp(refs.aiMoveZ, s1.pmz, 8, dt);
      // Sync bounce marker
      if (s1.bbp) {
        if (!refs.ballBouncePredict)
          refs.ballBouncePredict = new THREE.Vector3();
        refs.ballBouncePredict.set(s1.bbp[0], s1.bbp[1], s1.bbp[2]);
      } else {
        refs.ballBouncePredict = null;
      }
      // Sync opponent name from host
      if (s1.hn) opponentName.value = s1.hn;
      // Sync palettes from host (host's player = guest's AI, host's AI = guest's player)
      if (s1.pp2) aiPalette.value = s1.pp2;
      if (s1.ap2) playerPalette.value = s1.ap2;
      // Sync last point message — flip perspective for guest
      // Guard with seq check so older snapshots don't regress the message
      if (s1.lpm && s1.seq > lastPointMsgSeq) {
        lastPointMsgSeq = s1.seq;
        lastPointMsg.value = guestLpm(
          s1.lpm,
          s1.hn || '',
          s1.gn || PlayerProfile.state.firstName || 'Opp',
        );
      }
      // Sync rally state for guest bounce fault detection
      if (s1.rhc !== undefined) guestRallyHitCount = s1.rhc;
      if (s1.lhb !== undefined) guestLastHitBy = s1.lhb;
      if (s1.sfx2 !== undefined) guestServeFromX = s1.sfx2;
      if (s1.bcn !== undefined) guestBallClippedNet = s1.bcn;
      return;
    }

    const s0 = buffer[buffer.length - 2];
    const s1 = buffer[buffer.length - 1];

    // Interpolation factor (0..1) between the two snapshots
    const timeSinceLast = (performance.now() - lastStateReceivedAt) / 1000;
    const snapshotInterval = STATE_BROADCAST_INTERVAL;
    const t = Math.min(timeSinceLast / snapshotInterval, 1.0);

    // Snap ball on events
    if (snapBallNextFrame) {
      refs.ballPos.set(s1.bp[0], s1.bp[1], s1.bp[2]);
      refs.ballVel.set(s1.bv[0], s1.bv[1], s1.bv[2]);
      snapBallNextFrame = false;
    } else {
      // Hermite interpolation for ball
      const p0 = new THREE.Vector3(s0.bp[0], s0.bp[1], s0.bp[2]);
      const v0 = new THREE.Vector3(s0.bv[0], s0.bv[1], s0.bv[2]).multiplyScalar(
        snapshotInterval,
      );
      const p1 = new THREE.Vector3(s1.bp[0], s1.bp[1], s1.bp[2]);
      const v1 = new THREE.Vector3(s1.bv[0], s1.bv[1], s1.bv[2]).multiplyScalar(
        snapshotInterval,
      );
      const ballPos = hermiteLerp(p0, v0, p1, v1, t);
      refs.ballPos.copy(ballPos);
      refs.ballVel.set(s1.bv[0], s1.bv[1], s1.bv[2]);
    }

    // Damp player positions toward latest received state
    // From guest's perspective: host's playerPos = opponent, host's aiPos = guest (self)
    // Guest sees opponent at host's playerPos, and self at host's aiPos
    // Opponent (host's player): damp toward received position
    refs.aiPos.x = THREE.MathUtils.damp(refs.aiPos.x, s1.pp[0], 10, dt);
    refs.aiPos.z = THREE.MathUtils.damp(refs.aiPos.z, s1.pp[2], 10, dt);
    refs.aiPos.y = THREE.MathUtils.damp(refs.aiPos.y, s1.pp[1], 10, dt);

    // Self (guest): trust local prediction entirely.
    // Only snap to host state on explicit resync event (snapBallNextFrame).
    // Do NOT damp toward host position — that fights local input and causes "can't move".

    // Damp swing/reach/paddleAngle toward received values
    refs.playerSwing = THREE.MathUtils.damp(refs.playerSwing, s1.asw, 8, dt);
    refs.aiSwing = THREE.MathUtils.damp(refs.aiSwing, s1.psw, 8, dt);
    refs.playerReach = THREE.MathUtils.damp(refs.playerReach, s1.ar, 8, dt);
    refs.aiReach = THREE.MathUtils.damp(refs.aiReach, s1.pr, 8, dt);
    refs.aiPaddleAngle = THREE.MathUtils.damp(
      refs.aiPaddleAngle,
      s1.ppa,
      8,
      dt,
    );
    refs.playerPaddleAngle = THREE.MathUtils.damp(
      refs.playerPaddleAngle,
      s1.apa,
      8,
      dt,
    );

    // Sync opponent movement direction for animation
    refs.aiMoveDir = THREE.MathUtils.damp(refs.aiMoveDir, s1.pmd, 8, dt);
    refs.aiMoveZ = THREE.MathUtils.damp(refs.aiMoveZ, s1.pmz, 8, dt);

    // Sync bounce marker from host
    if (s1.bbp) {
      if (!refs.ballBouncePredict) refs.ballBouncePredict = new THREE.Vector3();
      refs.ballBouncePredict.set(s1.bbp[0], s1.bbp[1], s1.bbp[2]);
    } else {
      refs.ballBouncePredict = null;
    }

    // Sync opponent name from host
    if (s1.hn) opponentName.value = s1.hn;
    // Sync palettes from host (host's player = guest's AI, host's AI = guest's player)
    if (s1.pp2) aiPalette.value = s1.pp2;
    if (s1.ap2) playerPalette.value = s1.ap2;
    // Sync last point message — flip perspective for guest
    // Guard with seq check so older snapshots don't regress the message
    if (s1.lpm && s1.seq > lastPointMsgSeq) {
      lastPointMsgSeq = s1.seq;
      lastPointMsg.value = guestLpm(
        s1.lpm,
        s1.hn || '',
        s1.gn || PlayerProfile.state.firstName || 'Opp',
      );
    }
    // Sync rally state for guest bounce fault detection
    if (s1.rhc !== undefined) guestRallyHitCount = s1.rhc;
    if (s1.lhb !== undefined) guestLastHitBy = s1.lhb;
    if (s1.sfx2 !== undefined) guestServeFromX = s1.sfx2;
    if (s1.bcn !== undefined) guestBallClippedNet = s1.bcn;

    // Extrapolation: if no state received for >100ms, predict ball with velocity + gravity
    const timeSinceUpdate = performance.now() - lastStateReceivedAt;
    if (timeSinceUpdate > 100 && timeSinceUpdate < 200) {
      const extDt = (timeSinceUpdate - 100) / 1000;
      refs.ballPos.x += refs.ballVel.x * extDt;
      refs.ballPos.y += refs.ballVel.y * extDt + 0.5 * GRAVITY * extDt * extDt;
      refs.ballPos.z += refs.ballVel.z * extDt;
      refs.ballVel.y += GRAVITY * extDt;
    }
  }

  // PvP guest: send local input to host (rate-limited to 30Hz)
  let inputSendTimer = 0;
  const INPUT_SEND_INTERVAL = 1 / 30; // 30Hz
  let lastSentAx = 0;
  let lastSentAz = 0;

  function sendInputToHost() {
    // Combine keyboard booleans and analog axis into a single axis value
    let ax = input.axisX;
    let az = input.axisZ;
    if (input.left) ax -= 1;
    if (input.right) ax += 1;
    if (input.forward) az -= 1;
    if (input.backward) az += 1;
    ax = THREE.MathUtils.clamp(ax, -1.2, 1.2);
    az = THREE.MathUtils.clamp(az, -1.2, 1.2);

    // Rate-limit: only send at 30Hz or when values change significantly
    const now = performance.now();
    const timeSinceLastSend = (now - inputSendTimer) / 1000;
    const changed =
      Math.abs(ax - lastSentAx) > 0.05 || Math.abs(az - lastSentAz) > 0.05;
    const jumpRequested = input.jump;

    if (timeSinceLastSend < INPUT_SEND_INTERVAL && !changed && !jumpRequested)
      return;
    inputSendTimer = now;
    lastSentAx = ax;
    lastSentAz = az;

    p2p.broadcastInput({
      ax,
      az,
      sv: false, // serve trigger handled via triggerServe
      jk: jumpRequested,
      gn: PlayerProfile.state.firstName || '',
    });
  }

  function step(time: number) {
    if (lastTime === 0) lastTime = time;
    const dt = Math.min(time - lastTime, 0.05);
    lastTime = time;

    if (gameState.value === 'playing') {
      refs.servePending = servePending.value;
      pollGamepad();
      playerHitCooldown = Math.max(0, playerHitCooldown - dt);
      aiHitCooldown = Math.max(0, aiHitCooldown - dt);

      if (mode.value === 'pvp') {
        if (isHost.value) {
          // Host: run full simulation, apply remote input to opponent
          updatePlayer(dt);
          updateRemotePlayer(dt);
          updateBall(dt);
          broadcastStateToGuest(dt);
        } else if (isGuest.value) {
          // Guest: predict local player, send input, interpolate ball/state from host
          updatePlayer(dt);
          sendInputToHost();
          interpolateGuestState(dt);
          checkGuestFaults();
        }
      } else {
        // AI mode (original)
        updatePlayer(dt);
        updateAI(dt);
        updateBall(dt);
      }
    } else if (gameState.value === 'point-scored') {
      // Only host runs the point timer and ball reset; guest transitions via state sync
      if (!isPvP.value || isHost.value) {
        pointPauseTimer -= dt;
        // Keep broadcasting state during point-scored so guest sees the toast
        if (isPvP.value && isHost.value) {
          broadcastStateToGuest(dt);
        }
        if (pointPauseTimer <= 0) {
          gameState.value = 'playing';
          resetBall(servingTo.value);
        }
      }
    } else if (gameState.value === 'paused') {
      pollGamepadButtons();
      if (isPvP.value && isHost.value) {
        broadcastStateToGuest(dt);
      }
    } else if (gameState.value === 'reconnecting') {
      // Check if opponent reconnected
      if (p2p.connectionState.value === 'connected') {
        // Give action streams a moment to initialize, then resume
        if (!waitingForReconnectData) {
          waitingForReconnectData = true;
          reconnectGraceTimer = 0;
          // Clear stale data so fresh data is recognized
          if (isHost.value) {
            lastInputSeq = -1;
          } else {
            p2p.clearJitterBuffer();
            lastStateReceivedAt = 0;
            // Guest sends its scores to host so host can restore after refresh
            p2p.broadcastEvent({
              type: 'sync-scores',
              data: `${playerScore.value},${aiScore.value},${server.value},${servingTo.value},${servePending.value}`,
            });
          }
        }
        // Host keeps broadcasting, guest keeps sending input during grace period
        if (isHost.value) {
          broadcastStateToGuest(dt);
        } else if (isGuest.value) {
          sendInputToHost();
        }
        // Wait a short grace period for action streams to be ready
        reconnectGraceTimer += dt;
        if (reconnectGraceTimer >= 0.5) {
          waitingForReconnectData = false;
          // Pause so players can resume manually
          pausedFromState = 'playing';
          gameState.value = 'paused';
          if (isHost.value) {
            p2p.broadcastEvent({ type: 'resync' });
            p2p.broadcastEvent({ type: 'pause' });
            // If in serve state, reset ball to serve position
            // If mid-rally, replay the point (let rule) — ball was frozen during disconnect
            // and resuming from stale position could cause unfair net/out faults
            if (servePending.value) {
              resetBall(servingTo.value);
            } else {
              servePending.value = true;
              resetBall(servingTo.value);
            }
          } else {
            // Re-send scores now that event streams are ready
            p2p.broadcastEvent({
              type: 'sync-scores',
              data: `${playerScore.value},${aiScore.value},${server.value},${servingTo.value},${servePending.value}`,
            });
            // No ball snap needed — host replays from serve after reconnection
          }
        }
      } else if (p2p.connectionState.value === 'disconnected') {
        // Opponent failed to reconnect — match cancelled
        winReason.value = 'forfeit';
        winner.value = isHost.value ? 'player' : 'ai';
        gameState.value = 'game-over';
        if (isHost.value) {
          p2p.broadcastEvent({ type: 'game-over', data: 'forfeit' });
        }
      }
    }
  }

  let loopStarted = false;
  function startLoop() {
    if (loopStarted) {
      lastTime = 0;
      return;
    }
    loopStarted = true;
    lastTime = 0;
    window.addEventListener('gamepadconnected', onGamepadConnected);
    window.addEventListener('gamepaddisconnected', onGamepadDisconnected);
  }

  function stopLoop() {
    lastTime = 0;
  }

  // Keyboard handlers
  function onKeyDown(e: KeyboardEvent) {
    // Auto-serve on any movement key
    if (servePending.value && myServeTurn.value) {
      if (
        [
          'a',
          'A',
          'd',
          'D',
          'w',
          'W',
          's',
          'S',
          'ArrowLeft',
          'ArrowRight',
          'ArrowUp',
          'ArrowDown',
        ].includes(e.key)
      ) {
        triggerServe();
      }
    }
    switch (e.key) {
      case 'a':
      case 'A':
      case 'ArrowLeft':
        // Guest camera is mirrored: "left" on screen means +X
        if (isGuest.value) input.right = true;
        else input.left = true;
        break;
      case 'd':
      case 'D':
      case 'ArrowRight':
        if (isGuest.value) input.left = true;
        else input.right = true;
        break;
      case 'w':
      case 'W':
      case 'ArrowUp':
        // Guest camera is flipped: "forward" (up) means toward +Z
        if (isGuest.value) input.backward = true;
        else input.forward = true;
        break;
      case 's':
      case 'S':
      case 'ArrowDown':
        if (isGuest.value) input.forward = true;
        else input.backward = true;
        break;
      case ' ':
        input.jump = true;
        if (servePending.value && myServeTurn.value) triggerServe();
        break;
    }
  }

  function onKeyUp(e: KeyboardEvent) {
    switch (e.key) {
      case 'a':
      case 'A':
      case 'ArrowLeft':
        if (isGuest.value) input.right = false;
        else input.left = false;
        break;
      case 'd':
      case 'D':
      case 'ArrowRight':
        if (isGuest.value) input.left = false;
        else input.right = false;
        break;
      case 'w':
      case 'W':
      case 'ArrowUp':
        if (isGuest.value) input.backward = false;
        else input.forward = false;
        break;
      case 's':
      case 'S':
      case 'ArrowDown':
        if (isGuest.value) input.forward = false;
        else input.backward = false;
        break;
    }
  }

  // Touch input helpers (called from UI buttons)
  function triggerJump() {
    input.jump = true;
    if (servePending.value && myServeTurn.value) triggerServe();
  }

  function setTouchInput(
    dir: 'left' | 'right' | 'forward' | 'backward',
    active: boolean,
  ) {
    // Auto-serve on any touch movement
    if (active && servePending.value && myServeTurn.value) {
      triggerServe();
    }
    // Flip directions for guest (camera is on opposite side, both axes mirrored)
    if (isGuest.value) {
      if (dir === 'forward') dir = 'backward';
      else if (dir === 'backward') dir = 'forward';
      else if (dir === 'left') dir = 'right';
      else if (dir === 'right') dir = 'left';
    }
    input[dir] = active;
  }

  // Analog joystick input (-1..1)
  function setAxis(x: number, z: number) {
    // Auto-serve on joystick movement
    if (
      (Math.abs(x) > 0.1 || Math.abs(z) > 0.1) &&
      servePending.value &&
      myServeTurn.value
    ) {
      triggerServe();
    }
    // Flip axes for guest (camera is on opposite side, so both X and Z are mirrored)
    input.axisX = isGuest.value ? -x : x;
    input.axisZ = isGuest.value ? -z : z;
  }

  function cleanup() {
    stopLoop();
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('gamepadconnected', onGamepadConnected);
    window.removeEventListener('gamepaddisconnected', onGamepadDisconnected);
  }

  onUnmounted(cleanup);

  return {
    gameState,
    difficulty,
    rules,
    server,
    servePending,
    playerScore,
    aiScore,
    winner,
    winReason,
    lastPointMsg,
    refs,
    input,
    sound,
    playerPalette,
    aiPalette,
    opponentName,
    setDifficulty,
    setRules,
    startGame,
    resetScore,
    pauseGame,
    resumeGame,
    startLoop,
    stopLoop,
    step,
    onKeyDown,
    onKeyUp,
    setTouchInput,
    setAxis,
    triggerServe,
    triggerJump,
    myServeTurn,
    cleanup,
    // PvP
    mode,
    roomId,
    p2p,
    setRoomId,
    startPvP,
    cancelPvP,
  };
}
