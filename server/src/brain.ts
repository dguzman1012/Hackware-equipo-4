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
  seenAt: Ms; // capturedAt del frame, no la hora de respuesta del modelo
  caption: string; // "pensamiento" en personaje que devuelve el reader ('' si no hay)
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
export const T = {
  readMaxAgeMs: 1500, // lectura más vieja que esto se descarta
  actionMaxMs: 1500, // ninguna acción del LLM vive más que esto sin lectura nueva
  confirmHits: 2, // lecturas seguidas con target para pasar de searching a chasing
  minConfidence: 0.6,
  lostAfterMs: 1500, // sin ver target en chasing/found → lost
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

export function initialState(now: Ms): RobotState {
  // Arranca en stopped: nadie se mueve hasta apretar "Arrancar" en #control.
  throw new Error('not implemented');
}

/** Puro. Idempotente frente a eventos repetidos, lecturas fuera de orden y ticks redundantes. */
export function reduce(s: RobotState, e: BrainEvent, now: Ms): RobotState {
  switch (e.type) {
    case 'scene':
      // TODO if (e.read.frameId <= (s.target?.frameId ?? -1)) return s;           // fuera de orden
      // TODO if (now - e.read.capturedAt > T.readMaxAgeMs) return s;             // frame viejo
      // TODO action = e.read.action ? { ...e.read.action, until: capturedAt + min(durationMs, T.actionMaxMs), frameId } : s.action
      // TODO if (!e.read.target || confidence < T.minConfidence) → hits = 0 (no borra target: lo hace el tick por edad)
      // TODO else target = toTarget(e.read); hits += 1
      // TODO behavior = stepBehavior(s, now) (solo si run === 'running')
      throw new Error('not implemented');
    case 'frame':
      throw new Error('not implemented'); // lastFrameAt = e.capturedAt
    case 'run':
      // TODO if (e.run === s.run) return s; al pasar a running: behavior = searching(now), hits = 0, action = null
      throw new Error('not implemented');
    case 'telemetry':
      throw new Error('not implemented'); // esp = {lastTelemetryAt: now, distCm, yawDeg}
    case 'tick':
      // TODO behavior por tiempo (solo running):
      //   chasing/found sin target fresco (> lostAfterMs) → lost
      //   lost > sadMs → searching
      //   found > celebrateMs y sigue viéndolo → found (party=false)
      //   searching: flip spinDir cada spinFlipMs
      //   Cada transición solo si kind cambia (since estable → idempotente).
      throw new Error('not implemented');
    default: {
      const _exhaustive: never = e;
      return _exhaustive;
    }
  }
}

/** Puro y derivado. Prioridad: stopped > clamp de seguridad > show (found/lost) > acción del LLM > P-control/spin. */
export function plan(s: RobotState, now: Ms): ActuatorCommand {
  // TODO if (run === 'stopped') → STOP, servos 90/90, tone 0
  // TODO drive =
  //   behavior.kind === 'found' ? (party ? twirl(now) : STOP)
  //   : behavior.kind === 'lost' ? STOP
  //   : actionFresh(s.action, now) ? fromAction(s.action)         // el LLM manda el path (searching y chasing)
  //   : behavior.kind === 'chasing' ? chase(target, now)           // fallback: P sobre (cx - 0.5) con decay por edad
  //   : spin(spinDir)                                              // fallback: buscar girando
  // TODO clampSafety: sin frames frescos (cameraLostMs) → STOP; distCm < obstacleCm → sin avance; speed ≤ actionSpeedCap
  // TODO servo = poseFor(behavior)  (found: 180/0 corazón; lost: 30/150 caídos; default 90/90)
  // TODO tone = found ? (party ? 4 : 2) : lost ? 3 : chasing recién entrado (< 300 ms) ? 1 : 0
  throw new Error('not implemented');
}

export function actionFresh(a: PlannedAction | null, now: Ms): a is PlannedAction {
  return a !== null && now < a.until;
}

export function moodOf(s: RobotState, now: Ms): Mood {
  // offline (sin telemetría) > stopped > found&party → party > behavior.kind
  throw new Error('not implemented');
}

export function captionOf(s: RobotState): string {
  // target?.caption si es fresco; si no, una frase por behavior ("¿Gaucho? ¿Dónde estás?", "¿Por qué no me da bola?")
  throw new Error('not implemented');
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
  plan(now: Ms): ActuatorCommand {
    this.state = reduce(this.state, { type: 'tick' }, now);
    return plan(this.state, now);
  }

  snapshot(): RobotState {
    return this.state;
  }
}
