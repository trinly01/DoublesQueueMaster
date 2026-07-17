import { ref, reactive, onUnmounted } from 'vue';
import * as THREE from 'three';
import { useSound } from 'src/composables/useSound';

// Court dimensions (scaled to scene units: 1 unit = 1 meter)
const COURT_LENGTH = 13.41; // 44ft
const COURT_WIDTH = 6.1; // 20ft
const NET_HEIGHT = 0.86; // 34in
const KITCHEN_DEPTH = 2.13; // 7ft non-volley zone each side

// Ball physics
const GRAVITY = -9.8;
const BALL_RADIUS = 0.08;
const HIT_COOLDOWN = 0.4; // seconds between hits per player

// Game
const WIN_SCORE = 11;
const POINT_PAUSE = 1.2; // seconds pause after a point

export type Difficulty = 'easy' | 'medium' | 'hard';
export type GameState =
  | 'menu'
  | 'playing'
  | 'point-scored'
  | 'game-over'
  | 'paused';
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
  const gameState = ref<GameState>('menu');
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
  const lastPointMsg = ref('');
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

  // Input state
  const input = reactive({
    left: false,
    right: false,
    forward: false,
    backward: false,
    axisX: 0, // analog joystick -1..1
    axisZ: 0, // analog joystick -1..1 (negative = forward)
  });

  let lastTime = 0;
  let rafId = 0;
  let playerHitCooldown = 0;
  let aiHitCooldown = 0;
  let aiReactionTimer = 0;
  let aiTargetX = 0;
  let pointPauseTimer = 0;
  let servingTo: 'player' | 'ai' = 'player';

  // Rules tracking
  let lastHitBy: 'player' | 'ai' | null = null;
  let rallyHitCount = 0; // 0 = serve, 1 = return, 2 = third shot, volleys allowed from 3rd on
  let bounceCountThisSide = 0; // bounces on current side since last hit
  let ballBouncedOnSide = false; // has the ball bounced since crossing to current side
  let firstBounceWasOut = false; // was the first bounce out of bounds
  let currentSide: 'player' | 'ai' | null = null; // which side the ball is currently on
  let serveTimer = 0;
  let serveFromX = 0; // server's X position when serving (to check wrong court)
  let aiDinkRead: boolean | null = null; // null = not evaluated, true/false = committed

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

  function setDifficulty(d: Difficulty) {
    difficulty.value = d;
    if (typeof window !== 'undefined')
      localStorage.setItem('dqm_difficulty', d);
  }

  function setRules(r: Rules) {
    rules.value = r;
    if (typeof window !== 'undefined') localStorage.setItem('dqm_rules', r);
  }

  function startGame() {
    playerScore.value = 0;
    aiScore.value = 0;
    winner.value = null;
    lastPointMsg.value = '';
    gameState.value = 'playing';
    servingTo = 'player';
    server.value = 'player';
    resetBall('player');
    prevGamepadButtons = [];
  }

  function resetScore() {
    playerScore.value = 0;
    aiScore.value = 0;
    winner.value = null;
    lastPointMsg.value = '';
    gameState.value = 'menu';
  }

  let pausedFromState: GameState = 'playing';
  function pauseGame() {
    if (gameState.value === 'playing' || gameState.value === 'point-scored') {
      pausedFromState = gameState.value;
      gameState.value = 'paused';
      prevGamepadButtons = [];
    }
  }

  function resumeGame() {
    if (gameState.value === 'paused') {
      gameState.value = pausedFromState;
      prevGamepadButtons = [];
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
    const receiverZ =
      serveTo === 'player' ? -COURT_LENGTH / 2 - 0.8 : COURT_LENGTH / 2 + 0.8;
    if (serveTo === 'player') {
      refs.playerPos.set(serverX, 0, serverZ);
      refs.aiPos.set(receiverX, 0, receiverZ);
    } else {
      refs.aiPos.set(serverX, 0, serverZ);
      refs.playerPos.set(receiverX, 0, receiverZ);
    }

    // Ball starts at server's paddle height, at server position
    refs.ballPos.set(0, 1.2, serverZ);
    refs.ballVel.set(0, 0, 0);

    // Reset rules tracking
    lastHitBy = null;
    rallyHitCount = 0;
    bounceCountThisSide = 0;
    ballBouncedOnSide = false;
    firstBounceWasOut = false;
    currentSide = null;
    aiDinkRead = null;
    servePending.value = true;
    serveTimer = 0; // not used for player serve; AI uses its own timer

    playerHitCooldown = 0;
    aiHitCooldown = 0;
    aiReactionTimer = 0;
    playerCurrentVel.set(0, 0, 0);
    aiCurrentVel.set(0, 0, 0);
  }

  function doServe() {
    const serveTo = servingTo;
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
    firstBounceWasOut = false;
    currentSide = serveTo; // ball starts on server's side
    aiDinkRead = null;
    sound.serve();
    sound.paddleHit();
  }

  function scorePoint(forWhom: 'player' | 'ai', reason?: string) {
    const msg = reason || (forWhom === 'player' ? 'Point!' : 'AI Point!');

    if (reason) {
      // Harsh error sound when player faults (AI gets the point)
      // Softer sound when AI faults (player gets the point)
      if (forWhom === 'ai') {
        sound.fault();
      } else {
        sound.pointScored();
      }
    } else {
      sound.pointScored();
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
      } else {
        // Side out — serve passes to rally winner, no point scored
        const sideOutMsg =
          forWhom === 'player'
            ? 'Side Out, Your Serve!'
            : 'Side Out, AI Serves';
        lastPointMsg.value = reason ? `${reason} ${sideOutMsg}` : sideOutMsg;
        server.value = forWhom;
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
    }

    if (playerScore.value >= WIN_SCORE) {
      winner.value = 'player';
      gameState.value = 'game-over';
      sound.win();
      return;
    }
    if (aiScore.value >= WIN_SCORE) {
      winner.value = 'ai';
      gameState.value = 'game-over';
      sound.lose();
      return;
    }

    gameState.value = 'point-scored';
    pointPauseTimer = POINT_PAUSE;
    // Arcade: serve alternates to rally winner. Authentic: serve stays with server if they scored, passes on side-out
    if (rules.value === 'arcade') {
      servingTo = forWhom === 'player' ? 'player' : 'ai';
    } else {
      servingTo = server.value;
    }
  }

  function updatePlayer(dt: number) {
    const maxSpeed = PLAYER_MAX_SPEED;
    const cfg = AI_CONFIGS[difficulty.value];
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
    if (cfg.playerMagnet > 0 && refs.ballVel.z > 0 && !servePending.value) {
      // Predict where ball will be when it reaches player's Z
      const timeToPlayer = (refs.playerPos.z - refs.ballPos.z) / refs.ballVel.z;
      if (timeToPlayer > 0 && timeToPlayer < 2) {
        const predictedX = refs.ballPos.x + refs.ballVel.x * timeToPlayer;
        const xDiff = predictedX - refs.playerPos.x;
        // Blend magnet with player input — magnet adds a gentle pull
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

    // Clamp to player's half — wall at net only within court width
    // Outside court width, player can walk around the wall
    const insideCourt = Math.abs(refs.playerPos.x) < HALF_COURT_W;
    refs.playerPos.x = THREE.MathUtils.clamp(
      refs.playerPos.x,
      -CLAMP_HALF_W,
      CLAMP_HALF_W,
    );
    if (servePending.value) {
      // During serve: allow behind baseline, still block crossing net
      if (insideCourt) {
        refs.playerPos.z = THREE.MathUtils.clamp(
          refs.playerPos.z,
          0.3,
          CLAMP_BACK,
        );
      } else {
        refs.playerPos.z = THREE.MathUtils.clamp(
          refs.playerPos.z,
          -CLAMP_BACK,
          CLAMP_BACK,
        );
      }
    } else if (insideCourt) {
      // Within court width: blocked by wall at net
      refs.playerPos.z = THREE.MathUtils.clamp(
        refs.playerPos.z,
        0.3,
        CLAMP_BACK,
      );
    } else {
      // Outside court width: can walk around the wall
      refs.playerPos.z = THREE.MathUtils.clamp(
        refs.playerPos.z,
        -CLAMP_BACK,
        CLAMP_BACK,
      );
    }

    // Swing animation decay
    refs.playerSwing = Math.max(0, refs.playerSwing - dt * 3);

    // Compute reach toward ball and paddle angle
    if (!servePending.value && refs.ballVel.z > 0) {
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

    // Clamp to AI's half — wall at net only within court width
    const aiInsideCourt = Math.abs(refs.aiPos.x) < HALF_COURT_W;
    refs.aiPos.x = THREE.MathUtils.clamp(
      refs.aiPos.x,
      -CLAMP_HALF_W,
      CLAMP_HALF_W,
    );
    if (servePending.value) {
      if (aiInsideCourt) {
        refs.aiPos.z = THREE.MathUtils.clamp(refs.aiPos.z, CLAMP_AI_BACK, -0.3);
      } else {
        refs.aiPos.z = THREE.MathUtils.clamp(
          refs.aiPos.z,
          CLAMP_AI_BACK,
          CLAMP_BACK,
        );
      }
    } else if (aiInsideCourt) {
      refs.aiPos.z = THREE.MathUtils.clamp(refs.aiPos.z, CLAMP_AI_BACK, -0.3);
    } else {
      refs.aiPos.z = THREE.MathUtils.clamp(
        refs.aiPos.z,
        CLAMP_AI_BACK,
        CLAMP_BACK,
      );
    }

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
  ): boolean {
    // 3D body volume collision — player body + head + paddle reach
    // Paddle reach extends based on how far paddle is reaching toward ball
    const reach = isPlayer ? refs.playerReach : refs.aiReach;
    const bodyHalfWidth = 0.35 + reach * 0.3; // paddle extends wider when reaching
    const bodyHeightMin = 0.0;
    const bodyHeightMax = 1.2; // top of head
    const bodyHalfDepth = 0.35 + reach * 0.3; // paddle extends deeper when reaching

    const dx = Math.abs(pos.x - ballPos.x);
    const dz = Math.abs(pos.z - ballPos.z);
    const dy = ballPos.y;

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
      const playerSide = refs.playerPos.x > 0 ? -1 : 1;
      const targetCenter = playerSide * cfg.targetBias;
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
    firstBounceWasOut = false;
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

    sound.paddleHit();
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
    if (servePending.value && servingTo === 'player') {
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
      if (servingTo === 'player') {
        // Ball held on top of paddle (paddle at +0.25x, 0.35y, +0.15z relative to player)
        refs.ballPos.set(
          refs.playerPos.x + 0.25,
          0.45,
          refs.playerPos.z - 0.15,
        );
      } else {
        // AI: ball held on top of paddle (paddle at +0.25x, 0.35y, +0.15z relative to AI)
        refs.ballPos.set(refs.aiPos.x + 0.25, 0.45, refs.aiPos.z + 0.15);
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
        for (let i = 0; i < 120; i++) {
          simY += simVy * 0.016;
          simVy += GRAVITY * 0.016;
          simZ += simVz * 0.016;
          simX += simVx * 0.016;
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
      sound.ballBounce();

      // Check if bounce is in or out of bounds
      const bounceOutX = Math.abs(refs.ballPos.x) > HALF_COURT_W;
      const bounceOutZ = Math.abs(refs.ballPos.z) > HALF_COURT_L;
      const bounceIsOut = bounceOutX || bounceOutZ;

      // First bounce during rally: call out immediately if clearly OOB
      if (rallyHitCount > 1 && bounceCountThisSide === 1 && bounceIsOut) {
        const faultBy = lastHitBy;
        if (faultBy) {
          scorePoint(faultBy === 'player' ? 'ai' : 'player', 'Out!');
        }
        return;
      }

      // OOB check on SECOND bounce — opponent didn't return
      if (rallyHitCount > 1 && bounceCountThisSide >= 2) {
        if (firstBounceWasOut) {
          // First bounce was out — fault against last hitter
          const faultBy = lastHitBy;
          if (faultBy) {
            scorePoint(faultBy === 'player' ? 'ai' : 'player', 'Out!');
          }
          return;
        }
        // First bounce was in, second bounce = opponent didn't return
        const faultSide = currentSide;
        if (faultSide) {
          scorePoint(faultSide === 'player' ? 'ai' : 'player', 'In!');
        }
        return;
      }

      // Record first bounce in/out status (for second bounce check)
      if (bounceCountThisSide === 1) {
        firstBounceWasOut = bounceIsOut;
      }

      // Serve-specific checks — only on FIRST bounce
      if (rallyHitCount === 1 && bounceCountThisSide === 1) {
        const serverSide = lastHitBy;
        const opponentSide = serverSide === 'player' ? 'ai' : 'player';
        // Check if serve landed on server's own side (didn't cross net)
        const onServerSide =
          serverSide === 'player' ? refs.ballPos.z > 0 : refs.ballPos.z < 0;
        if (onServerSide) {
          scorePoint(opponentSide, 'Short serve!');
          return;
        }
        // Check if serve landed out of bounds
        if (
          Math.abs(refs.ballPos.x) > HALF_COURT_W ||
          Math.abs(refs.ballPos.z) > HALF_COURT_L
        ) {
          scorePoint(opponentSide, 'Serve out!');
          return;
        }
        // Check if serve landed in kitchen
        const inKitchen =
          opponentSide === 'player'
            ? refs.ballPos.z > 0 && refs.ballPos.z < KITCHEN_DEPTH
            : refs.ballPos.z < 0 && refs.ballPos.z > -KITCHEN_DEPTH;
        if (inKitchen) {
          scorePoint(opponentSide, 'Serve into kitchen!');
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
            scorePoint(opponentSide, 'Wrong serving side!');
            return;
          }
          // Ball must land diagonally (opposite side from server)
          const landedRight = refs.ballPos.x > 0;
          if (servedFromRight === landedRight) {
            scorePoint(opponentSide, 'Wrong court!');
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
    if (rallyHitCount > 0 && ballBouncedOnSide) {
      const pastPlayerBack =
        refs.ballPos.z > HALF_COURT_L + 0.5 && refs.ballVel.z > 0;
      const pastAiBack =
        refs.ballPos.z < -HALF_COURT_L - 0.5 && refs.ballVel.z < 0;
      if (pastPlayerBack || pastAiBack) {
        // After second bounce — point is over
        if (bounceCountThisSide >= 2) {
          if (pastPlayerBack) scorePoint('ai', 'In!');
          else scorePoint('player', 'In!');
          return;
        }
        // After first bounce — only call if ball is far past reach (+3m beyond baseline)
        if (
          refs.ballPos.z > HALF_COURT_L + 3 ||
          refs.ballPos.z < -HALF_COURT_L - 3
        ) {
          if (pastPlayerBack) scorePoint('ai', 'In!');
          else scorePoint('player', 'In!');
          return;
        }
      }
    }

    // Net collision — ball hits net and doesn't cross (fault)
    // If ball clips net but still has enough velocity to cross, let it continue
    if (Math.abs(refs.ballPos.z) < 0.05 && refs.ballPos.y < NET_HEIGHT) {
      // Check if ball is moving fast enough to still cross
      const speedTowardOpponent = Math.abs(refs.ballVel.z);
      if (speedTowardOpponent < 1.0) {
        // Ball stuck in net — fault by the last hitter
        // Ball moving toward player (z>0) = AI hit it = player's point
        // Ball moving toward AI (z<0) = player hit it = AI's point
        if (refs.ballVel.z > 0) {
          scorePoint('player', 'Net!');
        } else {
          scorePoint('ai', 'Net!');
        }
        return;
      }
      // Ball clips net — reduce velocity but let it continue
      refs.ballVel.z *= 0.5;
      refs.ballVel.y *= 0.5;
      sound.netHit();
    }

    // Ball stopped on same side (didn't get hit)
    const speedSq = refs.ballVel.lengthSq();
    if (speedSq < 0.25 && refs.ballPos.y < 0.15) {
      if (refs.ballPos.z > 0) {
        scorePoint('ai', 'Ball stopped!');
      } else {
        scorePoint('player', 'Ball stopped!');
      }
      return;
    }

    // Track which side the ball is on
    const newSide: 'player' | 'ai' = refs.ballPos.z > 0 ? 'player' : 'ai';
    if (currentSide !== newSide) {
      currentSide = newSide;
      bounceCountThisSide = 0;
      ballBouncedOnSide = false;
      firstBounceWasOut = false;
      aiDinkRead = null;
    }

    // Try hits — enforce pickleball rules (volley fault if ball hits body before bounce)
    if (refs.ballPos.z > 0) {
      tryHit(refs.playerPos, refs.ballPos, refs.ballVel, true);
    } else {
      // AI: don't attempt hit if ball is going out
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

    // D-pad as fallback (buttons 12-15)
    if (gp.buttons[12]?.pressed) {
      axisX = 0;
      axisZ = -1;
      stickActive = true;
    } else if (gp.buttons[13]?.pressed) {
      axisX = 0;
      axisZ = 1;
      stickActive = true;
    } else if (gp.buttons[14]?.pressed) {
      axisX = -1;
      axisZ = 0;
      stickActive = true;
    } else if (gp.buttons[15]?.pressed) {
      axisX = 1;
      axisZ = 0;
      stickActive = true;
    }

    // Only set axis from gamepad when sticks/d-pad are active
    // Otherwise let touch joystick or keyboard control movement
    if (stickActive) {
      setAxis(axisX, axisZ);
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

  function gameLoop(time: number) {
    rafId = requestAnimationFrame(gameLoop);

    if (lastTime === 0) lastTime = time;
    const dt = Math.min((time - lastTime) / 1000, 0.05);
    lastTime = time;

    if (gameState.value === 'playing') {
      refs.servePending = servePending.value;
      pollGamepad();
      playerHitCooldown = Math.max(0, playerHitCooldown - dt);
      aiHitCooldown = Math.max(0, aiHitCooldown - dt);

      updatePlayer(dt);
      updateAI(dt);
      updateBall(dt);
    } else if (gameState.value === 'point-scored') {
      pointPauseTimer -= dt;
      if (pointPauseTimer <= 0) {
        gameState.value = 'playing';
        resetBall(servingTo);
      }
    } else if (gameState.value === 'paused') {
      pollGamepadButtons();
    }
  }

  function startLoop() {
    if (rafId) return;
    lastTime = 0;
    window.addEventListener('gamepadconnected', onGamepadConnected);
    window.addEventListener('gamepaddisconnected', onGamepadDisconnected);
    rafId = requestAnimationFrame(gameLoop);
  }

  function stopLoop() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  // Keyboard handlers
  function onKeyDown(e: KeyboardEvent) {
    // Auto-serve on any movement key
    if (servePending.value && servingTo === 'player') {
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
        input.left = true;
        break;
      case 'd':
      case 'D':
      case 'ArrowRight':
        input.right = true;
        break;
      case 'w':
      case 'W':
      case 'ArrowUp':
        input.forward = true;
        break;
      case 's':
      case 'S':
      case 'ArrowDown':
        input.backward = true;
        break;
    }
  }

  function onKeyUp(e: KeyboardEvent) {
    switch (e.key) {
      case 'a':
      case 'A':
      case 'ArrowLeft':
        input.left = false;
        break;
      case 'd':
      case 'D':
      case 'ArrowRight':
        input.right = false;
        break;
      case 'w':
      case 'W':
      case 'ArrowUp':
        input.forward = false;
        break;
      case 's':
      case 'S':
      case 'ArrowDown':
        input.backward = false;
        break;
    }
  }

  // Touch input helpers (called from UI buttons)
  function setTouchInput(
    dir: 'left' | 'right' | 'forward' | 'backward',
    active: boolean,
  ) {
    // Auto-serve on any touch movement
    if (active && servePending.value && servingTo === 'player') {
      triggerServe();
    }
    input[dir] = active;
  }

  // Analog joystick input (-1..1)
  function setAxis(x: number, z: number) {
    // Auto-serve on joystick movement
    if (
      (Math.abs(x) > 0.1 || Math.abs(z) > 0.1) &&
      servePending.value &&
      servingTo === 'player'
    ) {
      triggerServe();
    }
    input.axisX = x;
    input.axisZ = z;
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
    lastPointMsg,
    refs,
    input,
    sound,
    setDifficulty,
    setRules,
    startGame,
    resetScore,
    pauseGame,
    resumeGame,
    startLoop,
    stopLoop,
    onKeyDown,
    onKeyUp,
    setTouchInput,
    setAxis,
    triggerServe,
    cleanup,
  };
}
