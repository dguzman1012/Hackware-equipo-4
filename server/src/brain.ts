// Único escritor de RobotState. Todo puro salvo la clase envoltorio.
// Invariantes:
//  (1) solo `reduce` produce un RobotState nuevo;
//  (2) `plan` es una función del estado, no guarda nada: no existe un "comando actual" aparte;
//  (3) el robot es autónomo: ningún humano decide movimiento. Lo único humano es run: stopped | running;
//  (4) la acción que propone el LLM se obedece mientras esté fresca; si expira o la API tarda, el P-control
//      sobre el último rumbo y la FSM de estados (lost → searching) sostienen el show;
//  (5) este módulo no conoce wire types (ni UDP ni WS). `toStateMsg` vive en hub.ts.
import type { ActionKind, Mood, RunState } from '@gaucho/protocol';
import type { SceneRead } from './perception';

export type Ms = number;

// ---------- Dominio ----------
export interface Target {
  cx: number; // centro normalizado 0..1 (0,0 = arriba-izquierda)
  cy: number;
  size: number; // max(w,h) normalizado 0..1; proxy de cercanía
  confidence: number; // 0..1
  frameId: number; // monotónico, lo asigna FrameBus
  seenAt: Ms; // cuándo LLEGÓ la lectura. Medido desde capturedAt, con ~3 s de latencia el target vencía entre dos lecturas seguidas
}

/** "Pensamiento" en personaje de la última lectura, la haya visto o no. */
export interface Thought {
  text: string;
  at: Ms; // cuándo llegó la lectura
}

/** Acción propuesta por el LLM, ya con vencimiento absoluto. */
export interface PlannedAction {
  kind: ActionKind;
  speed: number; // 0..1
  until: Ms; // capturedAt + min(durationMs, T.actionMaxMs)
  frameId: number;
}

export type Behavior =
  | { kind: 'searching'; since: Ms; spinDir: 1 | -1 } // gira despacio alternando cada spinFlipMs
  | { kind: 'chasing'; since: Ms } // se acerca a Gaucho
  | { kind: 'found'; since: Ms; party: boolean } // cerca: celebra; party si es reencuentro
  | { kind: 'lost'; since: Ms }; // drama, luego searching

export interface RobotState {
  run: RunState;
  behavior: Behavior;
  target: Target | null; // última lectura válida
  thought: Thought | null; // última frase del LLM (captionOf la usa mientras sea fresca)
  action: PlannedAction | null; // última acción del LLM (puede estar vencida: plan() lo chequea)
  hits: number; // lecturas válidas consecutivas (confirmHits filtra falsos positivos)
  lastFoundAt: Ms | null; // para decidir si un found es reencuentro (party)
  esp: { lastTelemetryAt: Ms | null; distCm: number | null; yawDeg: number | null };
  lastFrameAt: Ms | null; // sin frames frescos → STOP (clamp de seguridad)
}

export interface ActuatorCommand {
  drive: { left: number; right: number }; // -1..1 (esp.ts lo escala a PWM)
  servo: { deg1: number; deg2: number }; // 0..180
  tone: 0 | 1 | 2 | 3 | 4; // 0 silencio, 1 beep, 2 amor, 3 triste, 4 fiesta
}

// ---------- Eventos: todo actor externo habla así; nadie toca el estado ----------
export type BrainEvent =
  | { type: 'scene'; read: SceneRead }
  | { type: 'frame'; capturedAt: Ms }
  | { type: 'run'; run: RunState }
  | { type: 'telemetry'; distCm: number | null; yawDeg: number | null }
  | { type: 'tick' };

// ---------- Constantes del lazo (lo que se tunea con el chasis real) ----------
// Gemini tarda 2–3.5 s por frame con las 9 fotos de referencia (medido); ReaderLoop corta a 6 s.
// La edad de una LECTURA se mide desde capturedAt (readMaxAgeMs debe superar el timeout o toda lectura se descarta);
// la frescura del TARGET y del thought se miden desde que llegan, para que no venzan entre dos lecturas consecutivas.
export const T = {
  readMaxAgeMs: 6500, // lectura más vieja que esto se descarta (> READ_TIMEOUT_MS de perception.ts)
  actionMaxMs: 1500, // ninguna acción del LLM vive más que esto desde que llega
  confirmHits: 2, // lecturas seguidas con target para pasar de searching a chasing
  minConfidence: 0.6,
  lostAfterMs: 5000, // sin lectura con target hace más que esto en chasing/found → lost (≈ 1–2 lecturas sin verlo)
  thoughtMaxMs: 8000, // la frase del LLM se muestra hasta esto después de llegar; luego la frase por behavior
  foundSizeMin: 0.35, // target.size ≥ esto (o distCm < foundDistCm) → found
  foundDistCm: 30,
  celebrateMs: 4000,
  sadMs: 3000,
  reunionWindowMs: 20000, // lost → found dentro de esta ventana = party
  spinFlipMs: 3000,
  espOfflineMs: 1000,
  cameraLostMs: 3000, // sin frames → STOP
  obstacleCm: 20, // el firmware frena a 15; acá evitamos pedir lo imposible
  chase: { forward: 0.5, kTurn: 0.8, centerTol: 0.25 },
  searchSpin: 0.35,
  actionSpeedCap: 0.6, // techo a lo que pida el LLM: 1–2 s de latencia no pueden convertirse en un choque
} as const;

const STOP_DRIVE = { left: 0, right: 0 } as const;
const SERVO_NEUTRAL = { deg1: 90, deg2: 90 } as const;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function toTarget(read: SceneRead, t: NonNullable<SceneRead['target']>, now: Ms): Target {
  return { ...t, frameId: read.frameId, seenAt: now };
}

function isTargetFresh(s: RobotState, now: Ms): boolean {
  return s.target !== null && now - s.target.seenAt <= T.lostAfterMs;
}

function searchingSpinDir(since: Ms, now: Ms): 1 | -1 {
  const flips = Math.floor((now - since) / T.spinFlipMs);
  return (flips % 2 === 0 ? 1 : -1) as 1 | -1;
}

function stepBehavior(s: RobotState, now: Ms): { behavior: Behavior; lastFoundAt: Ms | null } {
  if (s.run !== 'running') {
    return { behavior: s.behavior, lastFoundAt: s.lastFoundAt };
  }

  let behavior = s.behavior;
  let lastFoundAt = s.lastFoundAt;
  const fresh = isTargetFresh(s, now);

  if (behavior.kind === 'searching') {
    const spinDir = searchingSpinDir(behavior.since, now);
    if (spinDir !== behavior.spinDir) behavior = { ...behavior, spinDir };
  }

  switch (behavior.kind) {
    case 'searching':
      if (s.hits >= T.confirmHits) {
        behavior = { kind: 'chasing', since: now };
      }
      break;
    case 'chasing':
      if (!fresh) {
        behavior = { kind: 'lost', since: now };
      } else if (
        s.target !== null &&
        (s.target.size >= T.foundSizeMin || (s.esp.distCm !== null && s.esp.distCm < T.foundDistCm))
      ) {
        const party = lastFoundAt !== null && now - lastFoundAt < T.reunionWindowMs;
        behavior = { kind: 'found', since: now, party };
        lastFoundAt = now;
      }
      break;
    case 'found':
      if (!fresh) {
        behavior = { kind: 'lost', since: now };
      } else if (behavior.party && now - behavior.since > T.celebrateMs) {
        behavior = { kind: 'found', since: behavior.since, party: false };
      }
      break;
    case 'lost':
      if (now - behavior.since > T.sadMs) {
        behavior = { kind: 'searching', since: now, spinDir: 1 };
      }
      break;
    default: {
      const _exhaustive: never = behavior;
      return _exhaustive;
    }
  }

  return { behavior, lastFoundAt };
}

export function initialState(now: Ms): RobotState {
  return {
    run: 'stopped',
    behavior: { kind: 'searching', since: now, spinDir: 1 },
    target: null,
    thought: null,
    action: null,
    hits: 0,
    lastFoundAt: null,
    esp: { lastTelemetryAt: null, distCm: null, yawDeg: null },
    lastFrameAt: null,
  };
}

/** Puro. Idempotente frente a eventos repetidos, lecturas fuera de orden y ticks redundantes. */
export function reduce(s: RobotState, e: BrainEvent, now: Ms): RobotState {
  switch (e.type) {
    case 'scene': {
      const { read } = e;
      if (read.frameId <= (s.target?.frameId ?? -1)) return s;
      if (now - read.capturedAt > T.readMaxAgeMs) return s;

      // La acción corre desde que llega, no desde el frame: con 2 s de latencia, medida desde capturedAt ya vendría vencida.
      const action = read.action
        ? {
            kind: read.action.kind,
            speed: read.action.speed,
            until: now + Math.min(read.action.durationMs, T.actionMaxMs),
            frameId: read.frameId,
          }
        : s.action;

      let target = s.target;
      let hits = s.hits;
      if (!read.target || read.target.confidence < T.minConfidence) {
        hits = 0;
      } else {
        target = toTarget(read, read.target, now);
        hits += 1;
      }

      const thought = read.caption ? { text: read.caption, at: now } : s.thought;
      const stepped = stepBehavior({ ...s, target, hits, action }, now);
      return { ...s, target, thought, hits, action, behavior: stepped.behavior, lastFoundAt: stepped.lastFoundAt };
    }
    case 'frame':
      return { ...s, lastFrameAt: e.capturedAt };
    case 'run': {
      if (e.run === s.run) return s;
      if (e.run === 'running') {
        return {
          ...s,
          run: e.run,
          behavior: { kind: 'searching', since: now, spinDir: 1 },
          hits: 0,
          action: null,
        };
      }
      return { ...s, run: e.run };
    }
    case 'telemetry':
      return { ...s, esp: { lastTelemetryAt: now, distCm: e.distCm, yawDeg: e.yawDeg } };
    case 'tick': {
      const stepped = stepBehavior(s, now);
      if (stepped.behavior === s.behavior && stepped.lastFoundAt === s.lastFoundAt) return s;
      return { ...s, behavior: stepped.behavior, lastFoundAt: stepped.lastFoundAt };
    }
    default: {
      const _exhaustive: never = e;
      return _exhaustive;
    }
  }
}

function fromAction(a: PlannedAction): { left: number; right: number } {
  const v = Math.min(a.speed, T.actionSpeedCap);
  switch (a.kind) {
    case 'forward':
      return { left: v, right: v };
    case 'back':
      return { left: -v, right: -v };
    case 'left':
      return { left: -v, right: v };
    case 'right':
      return { left: v, right: -v };
    case 'stop':
      return STOP_DRIVE;
    default: {
      const _exhaustive: never = a.kind;
      return _exhaustive;
    }
  }
}

function chase(target: Target): { left: number; right: number } {
  const err = target.cx - 0.5;
  const turn = T.chase.kTurn * err;
  const forward = Math.abs(err) < T.chase.centerTol ? T.chase.forward : 0;
  return { left: clamp(forward + turn, -1, 1), right: clamp(forward - turn, -1, 1) };
}

function spin(dir: 1 | -1): { left: number; right: number } {
  return { left: T.searchSpin * dir, right: -T.searchSpin * dir };
}

function twirl(now: Ms): { left: number; right: number } {
  const dir = Math.floor(now / 700) % 2 === 0 ? 1 : -1;
  return { left: 0.5 * dir, right: -0.5 * dir };
}

function poseFor(behavior: Behavior): { deg1: number; deg2: number } {
  switch (behavior.kind) {
    case 'found':
      return { deg1: 180, deg2: 0 };
    case 'lost':
      return { deg1: 30, deg2: 150 };
    case 'searching':
    case 'chasing':
      return SERVO_NEUTRAL;
    default: {
      const _exhaustive: never = behavior;
      return _exhaustive;
    }
  }
}

function toneFor(s: RobotState, now: Ms): 0 | 1 | 2 | 3 | 4 {
  if (s.run === 'stopped') return 0;
  switch (s.behavior.kind) {
    case 'found':
      return s.behavior.party ? 4 : 2;
    case 'lost':
      return 3;
    case 'chasing':
      return now - s.behavior.since < 300 ? 1 : 0;
    case 'searching':
      return 0;
    default: {
      const _exhaustive: never = s.behavior;
      return _exhaustive;
    }
  }
}

function clampSafety(
  s: RobotState,
  now: Ms,
  drive: { left: number; right: number },
): { left: number; right: number } {
  if (s.lastFrameAt === null || now - s.lastFrameAt > T.cameraLostMs) {
    return STOP_DRIVE;
  }
  if (s.esp.distCm !== null && s.esp.distCm < T.obstacleCm && drive.left > 0 && drive.right > 0) {
    return STOP_DRIVE;
  }
  return {
    left: clamp(drive.left, -1, 1),
    right: clamp(drive.right, -1, 1),
  };
}

/** Puro y derivado. Prioridad: stopped > clamp de seguridad > show (found/lost) > acción del LLM > P-control/spin. */
export function plan(s: RobotState, now: Ms): ActuatorCommand {
  if (s.run === 'stopped') {
    return { drive: STOP_DRIVE, servo: SERVO_NEUTRAL, tone: 0 };
  }

  return {
    drive: clampSafety(s, now, driveFor(s, now)),
    servo: poseFor(s.behavior),
    tone: toneFor(s, now),
  };
}

function driveFor(s: RobotState, now: Ms): { left: number; right: number } {
  const b = s.behavior;
  switch (b.kind) {
    case 'found':
      return b.party ? twirl(now) : STOP_DRIVE;
    case 'lost':
      return STOP_DRIVE;
    case 'chasing':
      if (actionFresh(s.action, now)) return fromAction(s.action);
      return s.target ? chase(s.target) : STOP_DRIVE;
    case 'searching':
      if (actionFresh(s.action, now)) return fromAction(s.action);
      return spin(b.spinDir);
    default: {
      const _exhaustive: never = b;
      return _exhaustive;
    }
  }
}

export function actionFresh(a: PlannedAction | null, now: Ms): a is PlannedAction {
  return a !== null && now < a.until;
}

export function moodOf(s: RobotState, now: Ms): Mood {
  if (s.run === 'stopped') return 'stopped';
  if (!espOnline(s, now)) return 'offline';
  if (s.behavior.kind === 'found' && s.behavior.party) return 'party';
  return s.behavior.kind;
}

export function captionOf(s: RobotState, now: Ms): string {
  if (s.thought && now - s.thought.at < T.thoughtMaxMs) return s.thought.text;
  switch (s.behavior.kind) {
    case 'searching':
      return '¿Gaucho? ¿Dónde estás?';
    case 'chasing':
      return '¡Ahí está! ¡Gaucho!';
    case 'found':
      return s.behavior.party ? '¡Volviste! 🎉' : '¡Te encontré! ❤️';
    case 'lost':
      return '¿Por qué no me da bola? 😢';
    default: {
      const _exhaustive: never = s.behavior;
      return _exhaustive;
    }
  }
}

export function espOnline(s: RobotState, now: Ms): boolean {
  return s.esp.lastTelemetryAt !== null && now - s.esp.lastTelemetryAt < T.espOfflineMs;
}

/** Envoltorio con estado: lo único mutable del server. */
export class Brain {
  private state: RobotState;

  constructor(now: Ms = Date.now()) {
    this.state = initialState(now);
  }

  dispatch(e: BrainEvent, now: Ms = Date.now()): void {
    this.state = reduce(this.state, e, now);
  }

  /** Avanza el reloj y devuelve el comando derivado. Llamar a 10 Hz desde main. */
  plan(now: Ms = Date.now()): ActuatorCommand {
    this.state = reduce(this.state, { type: 'tick' }, now);
    return plan(this.state, now);
  }

  snapshot(): RobotState {
    return this.state;
  }
}
