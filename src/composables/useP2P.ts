import { ref, onUnmounted } from 'vue';
import { joinRoom, type Room } from '@trystero-p2p/nostr';
import type { CharacterPalette } from './useRandomPalette';

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
  pp2?: CharacterPalette; // host's player palette
  ap2?: CharacterPalette; // host's AI palette
  lpm?: string; // lastPointMsg
  seq: number; // sequence number for jitter buffer
  gs: string; // host's game state for guest sync
}

export interface InputPayload {
  ax: number; // axisX -1..1
  az: number; // axisZ -1..1
  sv: boolean; // serve trigger
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
    | 'snap';
  data?: number | string | boolean;
}

export interface PingPayload {
  t: number; // timestamp
  r: boolean; // is reply
}

const APP_ID = 'dinkmatch';
const PING_INTERVAL = 5000; // 5 seconds
const PONG_TIMEOUT = 15000; // 15 seconds (3 missed pings)
const RECONNECT_WINDOW = 30000; // 30 seconds

export function useP2P() {
  const connectionState = ref<ConnectionStatus>('idle');
  const role = ref<PeerRole>(null);
  const opponentPing = ref(0);
  const reconnectTimer = ref(0);
  const opponentId = ref<string | null>(null);

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
  let inputSeq = 0;
  let stateSeq = 0;

  // Jitter buffer for state snapshots
  const jitterBuffer: StatePayload[] = [];
  const JITTER_BUFFER_SIZE = 3;

  function joinGameRoom(roomId: string) {
    if (room) leaveRoom();

    connectionState.value = 'connecting';
    role.value = null;
    opponentId.value = null;

    room = joinRoom(
      {
        appId: APP_ID,
        relayConfig: { redundancy: 3, manualReconnection: false },
        trickleIce: true,
        rtcConfig: {
          iceServers: [
            { urls: ['stun:stun.l.google.com:19302'] },
            { urls: ['stun:global.stun.twilio.com:3478'] },
          ],
          iceCandidatePoolSize: 10,
          bundlePolicy: 'max-bundle',
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
    };

    pingAction.onMessage = (data, context) => {
      const payload = data as unknown as PingPayload;
      if (payload.r) {
        lastPongReceived = performance.now();
        opponentPing.value = Math.round(lastPongReceived - payload.t);
      } else {
        pingActionSend({ t: payload.t, r: true }, context.peerId);
      }
    };

    room.onPeerJoin = (peerId: string) => {
      const wasWaiting = connectionState.value === 'waiting';
      opponentId.value = peerId;
      connectionState.value = 'connected';
      lastPongReceived = performance.now();
      startKeepalive();

      if (wasWaiting || role.value === 'host') {
        // We were already waiting in the room — we're the host
        role.value = 'host';
        eventActionSend({ type: 'ready', data: 'guest' }, peerId);
      } else if (role.value === null) {
        // We just joined — wait for 'ready' event from host
        // Fallback: if no 'ready' in 3s, assume host (edge case: both joined simultaneously)
        setTimeout(() => {
          if (role.value === null && opponentId.value) {
            role.value = 'host';
            eventActionSend({ type: 'ready', data: 'guest' }, opponentId.value);
          }
        }, 3000);
      }

      if (peerJoinCb) peerJoinCb(peerId);
    };

    room.onPeerLeave = (peerId: string) => {
      if (peerLeaveCb) peerLeaveCb(peerId);
      opponentId.value = null;
      if (connectionState.value === 'connected') {
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

  function startKeepalive() {
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
    }, PING_INTERVAL);
  }

  function startReconnectWindow() {
    connectionState.value = 'reconnecting';
    reconnectStartedAt = performance.now();
    reconnectTimer.value = RECONNECT_WINDOW / 1000;

    if (reconnectIntervalId) clearInterval(reconnectIntervalId);
    reconnectIntervalId = setInterval(() => {
      const elapsed = performance.now() - reconnectStartedAt;
      const remaining = Math.max(0, RECONNECT_WINDOW - elapsed);
      reconnectTimer.value = Math.ceil(remaining / 1000);

      if (remaining <= 0) {
        clearInterval(reconnectIntervalId!);
        reconnectIntervalId = null;
        connectionState.value = 'disconnected';
      }
    }, 100);
  }

  function broadcastState(state: Omit<StatePayload, 'seq'>) {
    if (!opponentId.value || connectionState.value !== 'connected') return;
    const payload: StatePayload = { ...state, seq: stateSeq++ };
    stateActionSend(payload, opponentId.value);
  }

  function broadcastInput(inputData: Omit<InputPayload, 'seq'>) {
    if (!opponentId.value || connectionState.value !== 'connected') return;
    const payload: InputPayload = { ...inputData, seq: inputSeq++ };
    inputActionSend(payload, opponentId.value);
  }

  function broadcastEvent(event: EventPayload) {
    if (!opponentId.value) return;
    eventActionSend(event, opponentId.value);
  }

  function onStateReceived(cb: (data: StatePayload) => void) {
    stateCb = cb;
  }

  function onInputReceived(cb: (data: InputPayload) => void) {
    inputCb = cb;
  }

  function onEventReceived(cb: (data: EventPayload) => void) {
    eventCb = cb;
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
    if (room) {
      room.leave();
      room = null;
    }
    opponentId.value = null;
    role.value = null;
    connectionState.value = 'idle';
    opponentPing.value = 0;
    clearJitterBuffer();
    stateSeq = 0;
    inputSeq = 0;
  }

  onUnmounted(leaveRoom);

  return {
    connectionState,
    role,
    opponentPing,
    reconnectTimer,
    opponentId,
    joinGameRoom,
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
  };
}
