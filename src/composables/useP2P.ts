import { ref, onUnmounted } from 'vue';
import { joinRoom, selfId, type Room } from '@trystero-p2p/nostr';
import type { CharacterPalette } from './useRandomPalette';
import { PlayerProfile } from 'src/services/playerProfile';

export type ConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'waiting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected';

export type PeerRole = 'host' | 'guest' | null;

export interface StatePayload {
  pp: [number, number, number]; // playerPos (host's local player)
  ap: [number, number, number]; // aiPos (opponent, from host's perspective)
  bp: [number, number, number]; // ballPos
  bv: [number, number, number]; // ballVel
  ps: number; // playerScore
  as: number; // aiScore
  sv: 'player' | 'ai'; // server
  sp: boolean; // servePending
  psw: number; // playerSwing
  asw: number; // aiSwing
  pr: number; // playerReach
  ar: number; // aiReach
  ppa: number; // playerPaddleAngle
  apa: number; // aiPaddleAngle
  pmd: number; // playerMoveDir (X velocity -1..1)
  amz: number; // aiMoveZ (forward/back velocity -1..1)
  amd: number; // aiMoveDir (X velocity -1..1)
  pmz: number; // playerMoveZ (forward/back velocity -1..1)
  bbp: [number, number, number] | null; // ballBouncePredict
  hn?: string; // host name (sent in every state update)
  gn?: string; // guest name (echoed back by host so guest knows what name host uses)
  pp2?: CharacterPalette; // host's player palette
  ap2?: CharacterPalette; // host's AI palette
  lpm?: string; // lastPointMsg
  sfx?: string[]; // sound effects played since last broadcast (for guest)
  seq: number; // sequence number for jitter buffer
  gs: string; // host's game state for guest sync
  ss?: 'player' | 'ai'; // scoring side (who scored the last point) for guest message personalization
  rhc?: number; // rallyHitCount (for guest bounce fault detection)
  lhb?: 'player' | 'ai' | null; // lastHitBy (for guest bounce fault detection)
  sfx2?: number; // serveFromX (for guest serve fault detection)
  bcn?: boolean; // ballClippedNet (for guest Net! vs In! distinction)
}

export interface InputPayload {
  ax: number; // axisX -1..1
  az: number; // axisZ -1..1
  sv: boolean; // serve trigger
  jk?: boolean; // jump trigger
  gn?: string; // guest name (sent in every input update)
  seq: number; // input sequence
}

export interface EventPayload {
  type:
    | 'score'
    | 'game-over'
    | 'serve'
    | 'ready'
    | 'pause'
    | 'resume'
    | 'resync'
    | 'snap'
    | 'sync-scores'
    | 'status'
    | 'fault'
    | 'fault-ack'
    | 'bounce-fault'
    | 'fault-notify';
  data?: number | string | boolean;
  seq?: number; // event sequence number for dedup
  ballY?: number; // ball height at collision time (guest reports to prove ball was in air)
  name?: string; // player name (sent in 'ready' event for early name sync)
  ss?: 'player' | 'ai'; // scoring side (sent in 'fault-notify' for guest message perspective)
}

export interface PingPayload {
  t: number; // timestamp
  r: boolean; // is reply
}

const APP_ID = 'dinkmatch';
const PING_INTERVAL = 5000; // 5 seconds
const PONG_TIMEOUT = 10000; // 10 seconds (2 missed pings) — detect fast, minimize unfair play
const RECONNECT_WINDOW = 45000; // 45 seconds

const TURN_CREDENTIALS_URL =
  'https://api.dinkmatch.club/flows/trigger/8fb22d38-4bee-4463-9fda-08d809c708cd';
const TURN_CREDENTIALS_TTL = 23 * 60 * 60 * 1000; // 23h (Cloudflare TTL is 24h)
const TURN_FETCH_TIMEOUT = 5000; // 5s abort timeout

let cachedTurnIceServers: RTCIceServer[] | null = null;
let cachedTurnExpiresAt = 0;
let turnFetchPromise: Promise<RTCIceServer[]> | null = null;

async function fetchCloudflareTurnServers(): Promise<RTCIceServer[]> {
  if (cachedTurnIceServers && Date.now() < cachedTurnExpiresAt) {
    return cachedTurnIceServers;
  }
  if (turnFetchPromise) return turnFetchPromise;

  turnFetchPromise = (async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TURN_FETCH_TIMEOUT);
      const response = await fetch(TURN_CREDENTIALS_URL, {
        method: 'POST',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!response.ok)
        throw new Error(`TURN flow returned ${response.status}`);
      const data = await response.json();
      const iceServers = data?.data?.iceServers ?? data?.iceServers;
      if (Array.isArray(iceServers) && iceServers.length > 0) {
        cachedTurnIceServers = iceServers as RTCIceServer[];
        cachedTurnExpiresAt = Date.now() + TURN_CREDENTIALS_TTL;
        console.log(
          '[TURN] Cloudflare TURN credentials cached:',
          cachedTurnIceServers.length,
          'servers',
        );
        return cachedTurnIceServers;
      }
    } catch (err) {
      console.warn('[TURN] Failed to fetch Cloudflare TURN credentials:', err);
    }
    return [];
  })().finally(() => {
    turnFetchPromise = null;
  });

  return turnFetchPromise;
}

// Kick off fetch immediately on module load (non-blocking)
fetchCloudflareTurnServers();

export function useP2P() {
  const connectionState = ref<ConnectionStatus>('idle');
  const role = ref<PeerRole>(null);
  const opponentPing = ref(0);
  const reconnectTimer = ref(0);
  const opponentId = ref<string | null>(null);
  let inMatch = false;
  const peerVerified = ref(false);

  let room: Room | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stateActionSend: (data: any, target?: string) => Promise<void> = () =>
    Promise.resolve();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let inputActionSend: (data: any, target?: string) => Promise<void> = () =>
    Promise.resolve();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let eventActionSend: (data: any, target?: string) => Promise<void> = () =>
    Promise.resolve();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pingActionSend: (data: any, target?: string) => Promise<void> = () =>
    Promise.resolve();

  let stateCb: ((data: StatePayload) => void) | null = null;
  let inputCb: ((data: InputPayload) => void) | null = null;
  let eventCb: ((data: EventPayload) => void) | null = null;
  let peerJoinCb: ((peerId: string) => void) | null = null;
  let peerLeaveCb: ((peerId: string) => void) | null = null;

  // Keepalive state
  let lastPongReceived = 0;
  let pingIntervalId: ReturnType<typeof setInterval> | null = null;
  let reconnectIntervalId: ReturnType<typeof setInterval> | null = null;
  let reconnectStartedAt = 0;
  let currentRoomId: string | null = null;
  let skipStartReconnect = false;
  let lastRejoinTime = 0;
  let inputSeq = 0;
  let stateSeq = 0;
  let eventSeq = 0;
  let lastStateSeq = -1; // highest state seq received (for dedup)
  let lastEventSeq = -1; // highest event seq received (for dedup)

  // Jitter buffer for state snapshots
  const jitterBuffer: StatePayload[] = [];
  const JITTER_BUFFER_SIZE = 3;

  async function joinGameRoom(roomId: string) {
    if (room) leaveRoom();

    currentRoomId = roomId;
    connectionState.value = 'connecting';
    const savedRole =
      typeof window !== 'undefined' ? localStorage.getItem('dqm_role') : null;
    role.value = savedRole as 'host' | 'guest' | null;
    opponentId.value = null;

    // Ensure TURN credentials are available before connecting
    if (!cachedTurnIceServers || Date.now() >= cachedTurnExpiresAt) {
      console.log('[TURN] joinGameRoom: awaiting TURN credentials...');
      await fetchCloudflareTurnServers();
    }

    const iceServers = [
      ...(cachedTurnIceServers ?? []),
      { urls: ['stun:stun.l.google.com:19302'] },
      { urls: ['stun:global.stun.twilio.com:3478'] },
    ];
    console.log(
      '[TURN] joinGameRoom ICE servers:',
      iceServers.length,
      'cached TURN:',
      cachedTurnIceServers ? 'yes' : 'no',
    );

    room = joinRoom(
      {
        appId: APP_ID,
        relayConfig: { redundancy: 3, manualReconnection: false },
        trickleIce: true,
        rtcConfig: {
          iceServers,
        },
      },
      `${APP_ID}-${roomId}`,
    );

    const stateAction = room.makeAction('state');
    const inputAction = room.makeAction('input');
    const eventAction = room.makeAction('events');
    const pingAction = room.makeAction('ping');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stateActionSend = (data: any, target?: string) =>
      stateAction.send(data, { target: target ?? null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    inputActionSend = (data: any, target?: string) =>
      inputAction.send(data, { target: target ?? null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    eventActionSend = (data: any, target?: string) =>
      eventAction.send(data, { target: target ?? null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pingActionSend = (data: any, target?: string) =>
      pingAction.send(data, { target: target ?? null });

    stateAction.onMessage = (data) => {
      if (stateCb) stateCb(data as unknown as StatePayload);
    };

    inputAction.onMessage = (data) => {
      if (inputCb) inputCb(data as unknown as InputPayload);
    };

    eventAction.onMessage = (data) => {
      if (eventCb) eventCb(data as unknown as EventPayload);
      // Receiving any event proves the data channel works — same as pong
      if (!peerVerified.value) {
        console.log(
          '[SYNC] eventAction: setting peerVerified=true, connState:',
          connectionState.value,
        );
        peerVerified.value = true;
        if (connectionState.value === 'reconnecting') {
          connectionState.value = 'connected';
          cancelReconnect();
          startKeepalive(PING_INTERVAL);
        }
      }
    };

    pingAction.onMessage = (data, context) => {
      const payload = data as unknown as PingPayload;
      if (payload.r) {
        lastPongReceived = performance.now();
        opponentPing.value = Math.round(lastPongReceived - payload.t);
        // Mark peer as verified — we received a pong, so data channel works
        if (!peerVerified.value) {
          peerVerified.value = true;
          // If we were reconnecting, now we're truly connected
          if (connectionState.value === 'reconnecting') {
            connectionState.value = 'connected';
            cancelReconnect();
            // Switch to normal ping interval now that we're verified
            startKeepalive(PING_INTERVAL);
          }
        }
      } else {
        pingActionSend({ t: payload.t, r: true }, context.peerId);
      }
    };

    room.onPeerJoin = (peerId: string) => {
      opponentId.value = peerId;
      lastPongReceived = performance.now();

      // If reconnecting or in an active match, don't immediately set 'connected'
      // — wait for pong/event to verify the data channel is actually working
      if (connectionState.value === 'reconnecting' || inMatch) {
        connectionState.value = 'reconnecting';
        peerVerified.value = false;
        // Send ping immediately to probe the data channel
        pingActionSend({ t: performance.now(), r: false }, peerId);
        // Use 1s ping interval during reconnection for faster verification
        startKeepalive(1000);
      } else {
        // Initial connection — set connected immediately (pong will verify)
        connectionState.value = 'connected';
        peerVerified.value = false;
        cancelReconnect();
        startKeepalive();
      }

      // Send our name to the peer via ready event
      const myName =
        (typeof PlayerProfile !== 'undefined' &&
          PlayerProfile.state.firstName) ||
        '';

      if (role.value === 'host') {
        // Already host (reconnection) — re-send ready
        eventActionSend({ type: 'ready', data: 'guest', name: myName }, peerId);
      } else if (role.value === 'guest') {
        // Already guest (reconnection) — re-send ready
        eventActionSend({ type: 'ready', data: 'host', name: myName }, peerId);
      } else if (role.value === null) {
        // Deterministic role assignment: lower selfId becomes host
        // This is immune to ICE timing — no race condition with the 2s waiting timeout
        if (selfId <= peerId) {
          role.value = 'host';
          if (typeof window !== 'undefined')
            localStorage.setItem('dqm_role', 'host');
          eventActionSend(
            { type: 'ready', data: 'guest', name: myName },
            peerId,
          );
        } else {
          // We're the guest — wait for host's 'ready' event
          // Fallback: if no 'ready' in 3s, claim host (edge case: host didn't see us)
          setTimeout(() => {
            if (role.value === null && opponentId.value) {
              role.value = 'host';
              if (typeof window !== 'undefined')
                localStorage.setItem('dqm_role', 'host');
              eventActionSend(
                { type: 'ready', data: 'guest', name: myName },
                opponentId.value,
              );
            }
          }, 3000);
        }
      }

      if (peerJoinCb) peerJoinCb(peerId);
    };

    room.onPeerLeave = (peerId: string) => {
      if (peerId !== opponentId.value) return;
      if (peerVerified.value) return;
      console.log(
        '[SYNC] onPeerLeave: inMatch:',
        inMatch,
        'connState:',
        connectionState.value,
      );
      if (peerLeaveCb) peerLeaveCb(peerId);
      opponentId.value = null;
      peerVerified.value = false;
      // Only reconnect if in an active match — if just waiting/connecting,
      // stay in the room and let the opponent rejoin
      if (connectionState.value === 'connected' && inMatch) {
        startReconnectWindow();
      }
    };

    // If still connecting after 2s with no peer, transition to waiting
    // Role is NOT assigned here — it's assigned in onPeerJoin
    setTimeout(() => {
      if (connectionState.value === 'connecting') {
        connectionState.value = 'waiting';
      }
    }, 2000);
  }

  function startKeepalive(interval: number = PING_INTERVAL) {
    if (pingIntervalId) clearInterval(pingIntervalId);
    lastPongReceived = performance.now();

    pingIntervalId = setInterval(() => {
      if (!opponentId.value) return;
      pingActionSend({ t: performance.now(), r: false }, opponentId.value);

      if (performance.now() - lastPongReceived > PONG_TIMEOUT) {
        if (connectionState.value === 'connected') {
          startReconnectWindow();
        }
      }
    }, interval);
  }

  function startReconnectWindow() {
    connectionState.value = 'reconnecting';
    reconnectStartedAt = performance.now();
    reconnectTimer.value = RECONNECT_WINDOW / 1000;

    if (reconnectIntervalId) clearInterval(reconnectIntervalId);

    // Don't immediately rejoin — stay in the room and wait for opponent to rejoin.
    // Only retry rejoin after 10s if no peer appears (handles WiFi drop where
    // our own Nostr subscription might be stale, but gives refreshed opponents
    // time to reconnect without both sides churning).
    lastRejoinTime = performance.now();

    reconnectIntervalId = setInterval(() => {
      const elapsed = performance.now() - reconnectStartedAt;
      const remaining = Math.max(0, RECONNECT_WINDOW - elapsed);
      reconnectTimer.value = Math.ceil(remaining / 1000);

      // Retry rejoin every 5s after the initial 10s grace period
      if (
        remaining > 0 &&
        connectionState.value === 'reconnecting' &&
        currentRoomId &&
        elapsed >= 10000
      ) {
        const sinceLastRejoin = performance.now() - lastRejoinTime;
        if (sinceLastRejoin >= 5000) {
          lastRejoinTime = performance.now();
          skipStartReconnect = true;
          rejoinRoom(currentRoomId);
        }
      }

      if (remaining <= 0) {
        clearInterval(reconnectIntervalId!);
        reconnectIntervalId = null;
        connectionState.value = 'disconnected';
      }
    }, 100);
  }

  function broadcastState(state: Omit<StatePayload, 'seq'>) {
    if (!opponentId.value) return;
    const payload: StatePayload = { ...state, seq: stateSeq++ };
    stateActionSend(payload, opponentId.value);
  }

  function broadcastInput(inputData: Omit<InputPayload, 'seq'>) {
    if (!opponentId.value) return;
    const payload: InputPayload = { ...inputData, seq: inputSeq++ };
    inputActionSend(payload, opponentId.value);
  }

  function broadcastEvent(event: EventPayload) {
    if (!opponentId.value) return;
    const payload: EventPayload = { ...event, seq: eventSeq++ };
    eventActionSend(payload, opponentId.value);
  }

  function onStateReceived(cb: (data: StatePayload) => void) {
    stateCb = cb;
  }

  function onInputReceived(cb: (data: InputPayload) => void) {
    inputCb = cb;
  }

  function onEventReceived(cb: (data: EventPayload) => void) {
    // Wrap callback with dedup: ignore events with seq already seen
    eventCb = (data: EventPayload) => {
      if (data.seq !== undefined) {
        if (data.seq <= lastEventSeq) return; // stale or duplicate
        lastEventSeq = data.seq;
      }
      cb(data);
    };
  }

  function onPeerJoin(cb: (peerId: string) => void) {
    peerJoinCb = cb;
  }

  function onPeerLeave(cb: (peerId: string) => void) {
    peerLeaveCb = cb;
  }

  async function getOpponentPing(): Promise<number | null> {
    if (!opponentId.value || !room) return null;
    return room.ping(opponentId.value);
  }

  function pushToJitterBuffer(state: StatePayload) {
    // Dedup: ignore stale state packets (seq already seen)
    if (state.seq <= lastStateSeq) return;
    lastStateSeq = state.seq;
    jitterBuffer.push(state);
    if (jitterBuffer.length > JITTER_BUFFER_SIZE) {
      jitterBuffer.shift();
    }
  }

  function getJitterBuffer(): StatePayload[] {
    return jitterBuffer;
  }

  function clearJitterBuffer() {
    jitterBuffer.length = 0;
  }

  function cancelReconnect() {
    if (reconnectIntervalId) {
      clearInterval(reconnectIntervalId);
      reconnectIntervalId = null;
    }
    reconnectTimer.value = 0;
  }

  function leaveRoom() {
    if (pingIntervalId) {
      clearInterval(pingIntervalId);
      pingIntervalId = null;
    }
    cancelReconnect();
    currentRoomId = null;
    if (room) {
      room.leave();
      room = null;
    }
    opponentId.value = null;
    role.value = null;
    if (typeof window !== 'undefined') localStorage.removeItem('dqm_role');
    connectionState.value = 'idle';
    opponentPing.value = 0;
    peerVerified.value = false;
    clearJitterBuffer();
    stateSeq = 0;
    inputSeq = 0;
    eventSeq = 0;
    lastStateSeq = -1;
    lastEventSeq = -1;
  }

  async function rejoinRoom(roomId: string) {
    // Preserve role so host/guest assignment survives reconnection
    const savedRole = role.value;
    currentRoomId = roomId;
    if (pingIntervalId) {
      clearInterval(pingIntervalId);
      pingIntervalId = null;
    }
    // When called from startReconnectWindow, preserve the retry interval
    // and connectionState so the retry loop and 45s timer keep running
    if (!skipStartReconnect) {
      if (reconnectIntervalId) {
        clearInterval(reconnectIntervalId);
        reconnectIntervalId = null;
      }
    }
    if (room) {
      room.leave();
      room = null;
    }
    opponentId.value = null;
    if (!skipStartReconnect) {
      connectionState.value = 'connecting';
    }
    opponentPing.value = 0;
    clearJitterBuffer();
    stateSeq = 0;
    inputSeq = 0;
    eventSeq = 0;
    lastStateSeq = -1;
    lastEventSeq = -1;

    // Ensure TURN credentials are available before connecting
    if (!cachedTurnIceServers || Date.now() >= cachedTurnExpiresAt) {
      console.log('[TURN] rejoinRoom: awaiting TURN credentials...');
      await fetchCloudflareTurnServers();
    }

    const iceServers = [
      ...(cachedTurnIceServers ?? []),
      { urls: ['stun:stun.l.google.com:19302'] },
      { urls: ['stun:global.stun.twilio.com:3478'] },
    ];

    room = joinRoom(
      {
        appId: APP_ID,
        relayConfig: { redundancy: 3, manualReconnection: false },
        trickleIce: true,
        rtcConfig: {
          iceServers,
        },
      },
      `${APP_ID}-${roomId}`,
    );

    const stateAction = room.makeAction('state');
    const inputAction = room.makeAction('input');
    const eventAction = room.makeAction('events');
    const pingAction = room.makeAction('ping');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stateActionSend = (data: any, target?: string) =>
      stateAction.send(data, { target: target ?? null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    inputActionSend = (data: any, target?: string) =>
      inputAction.send(data, { target: target ?? null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    eventActionSend = (data: any, target?: string) =>
      eventAction.send(data, { target: target ?? null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pingActionSend = (data: any, target?: string) =>
      pingAction.send(data, { target: target ?? null });

    stateAction.onMessage = (data) => {
      if (stateCb) stateCb(data as unknown as StatePayload);
    };

    inputAction.onMessage = (data) => {
      if (inputCb) inputCb(data as unknown as InputPayload);
    };

    eventAction.onMessage = (data) => {
      if (eventCb) eventCb(data as unknown as EventPayload);
      // Receiving any event proves the data channel works — same as pong
      if (!peerVerified.value) {
        console.log(
          '[SYNC] eventAction: setting peerVerified=true, connState:',
          connectionState.value,
        );
        peerVerified.value = true;
        if (connectionState.value === 'reconnecting') {
          connectionState.value = 'connected';
          cancelReconnect();
          startKeepalive(PING_INTERVAL);
        }
      }
    };

    pingAction.onMessage = (data, context) => {
      const payload = data as unknown as PingPayload;
      if (payload.r) {
        lastPongReceived = performance.now();
        opponentPing.value = Math.round(lastPongReceived - payload.t);
        // Mark peer as verified — we received a pong, so data channel works
        if (!peerVerified.value) {
          peerVerified.value = true;
          // If we were reconnecting, now we're truly connected
          if (connectionState.value === 'reconnecting') {
            connectionState.value = 'connected';
            cancelReconnect();
            // Switch to normal ping interval now that we're verified
            startKeepalive(PING_INTERVAL);
          }
        }
      } else {
        pingActionSend({ t: payload.t, r: true }, context.peerId);
      }
    };

    room.onPeerJoin = (peerId: string) => {
      opponentId.value = peerId;
      lastPongReceived = performance.now();

      // If reconnecting or in an active match, don't immediately set 'connected'
      // — wait for pong/event to verify the data channel is actually working
      if (connectionState.value === 'reconnecting' || inMatch) {
        connectionState.value = 'reconnecting';
        peerVerified.value = false;
        // Send ping immediately to probe the data channel
        pingActionSend({ t: performance.now(), r: false }, peerId);
        // Use 1s ping interval during reconnection for faster verification
        startKeepalive(1000);
      } else {
        // Initial connection — set connected immediately (pong will verify)
        connectionState.value = 'connected';
        peerVerified.value = false;
        cancelReconnect();
        startKeepalive();
      }

      const myName =
        (typeof PlayerProfile !== 'undefined' &&
          PlayerProfile.state.firstName) ||
        '';

      // Re-send ready event with preserved role so refreshed opponent knows their role
      if (savedRole === 'host') {
        role.value = 'host';
        if (typeof window !== 'undefined')
          localStorage.setItem('dqm_role', 'host');
        eventActionSend({ type: 'ready', data: 'guest', name: myName }, peerId);
      } else if (savedRole === 'guest') {
        role.value = 'guest';
        if (typeof window !== 'undefined')
          localStorage.setItem('dqm_role', 'guest');
        eventActionSend({ type: 'ready', data: 'host', name: myName }, peerId);
      }

      if (peerJoinCb) peerJoinCb(peerId);
    };

    room.onPeerLeave = (peerId: string) => {
      if (peerId !== opponentId.value) return;
      if (peerVerified.value) return;
      console.log(
        '[SYNC] onPeerLeave (rejoin): inMatch:',
        inMatch,
        'connState:',
        connectionState.value,
      );
      if (peerLeaveCb) peerLeaveCb(peerId);
      opponentId.value = null;
      peerVerified.value = false;
      if (connectionState.value === 'connected' && inMatch) {
        startReconnectWindow();
      }
    };

    // Start reconnect window so if no peer joins within 45s,
    // connectionState transitions to 'disconnected' for auto-cancel
    // Skip if called from startReconnectWindow to avoid infinite recursion
    if (skipStartReconnect) {
      skipStartReconnect = false;
    } else {
      startReconnectWindow();
    }
  }

  onUnmounted(leaveRoom);

  function setInMatch(value: boolean) {
    inMatch = value;
  }

  function isInMatch() {
    return inMatch;
  }

  return {
    connectionState,
    role,
    opponentPing,
    reconnectTimer,
    opponentId,
    peerVerified,
    joinGameRoom,
    rejoinRoom,
    leaveRoom,
    broadcastState,
    broadcastInput,
    broadcastEvent,
    onStateReceived,
    onInputReceived,
    onEventReceived,
    onPeerJoin,
    onPeerLeave,
    getOpponentPing,
    pushToJitterBuffer,
    getJitterBuffer,
    clearJitterBuffer,
    cancelReconnect,
    setInMatch,
    isInMatch,
  };
}
