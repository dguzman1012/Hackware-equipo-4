// Único escritor de RobotState. Todo puro salvo la clase envoltorio.
// Invariantes:
//  (1) solo `reduce` produce un RobotState nuevo;
//  (2) `plan` es una función del estado, no guarda nada: no existe un "comando actual" aparte;
//  (3) toda decisión de "quién mueve" vive en `mode` y se resuelve en `plan`;
//  (4) este módulo no conoce wire types (ni UDP ni WS). `toStateMsg` vive en hub.ts.
import type { Mode, Mood } from '@gaucho/protocol';
import type { Detection } from './perception';

export type Ms = number;

// ---------- Dominio ----------
export interface Target {
  cx: number; // centro normalizado 0..1 (0,0 = arriba-izquierda)
  cy: number;
  size: number; // max(w,h) normalizado 0..1; proxy de cercanía
  confidence: number; // 0..1
  frameId: number; // monotónico, lo asigna FrameBus
  seenAt: Ms; // capturedAt del frame, no la hora de respuesta del modelo
  caption: string; // "pensamiento" en personaje que devuelve el detector ('' si no hay)
}

export type Behavior =
  | { kind: 'searching'; since: Ms; spinDir: 1 | -1 } // gira despacio alternando cada spinFlipMs
  | { kind: 'chasing'; since: Ms } // avanza + corrige rumbo hacia target.cx
  | { kind: 'found'; since: Ms; party: boolean } // cerca: celebra; party si es reencuentro
  | { kind: 'lost'; since: Ms }; // drama, luego searching

export interface Stick {
  x: number; // + derecha
  y: number; // + adelante
  at: Ms;
}

export interface RobotState {
  mode: Mode;
  behavior: Behavior;
  target: Target | null; // última detección válida (se actualiza también en puppet: el viewer muestra bbox)
  hits: number; // detecciones válidas consecutivas (CONFIRM_HITS filtra falsos positivos)
  lastFoundAt: Ms | null; // para decidir si un found es reencuentro (party)
  stick: Stick;
  gesture: { name: 'heart' | 'wave'; until: Ms } | null;
  esp: { lastTelemetryAt: Ms | null; distCm: number | null; yawDeg: number | null };
  lastFrameAt: Ms | null; // sin frames frescos en auto → STOP (clamp de seguridad)
}

export interface ActuatorCommand {
  drive: { left: number; right: number }; // -1..1 (esp.ts lo escala a PWM)
  servo: { deg1: number; deg2: number }; // 0..180
  tone: 0 | 1 | 2 | 3 | 4; // 0 silencio, 1 beep, 2 amor, 3 triste, 4 fiesta
}

// ---------- Eventos: todo actor externo habla así; nadie toca el estado ----------
export type BrainEvent =
  | { type: 'detection'; detection: Detection }
  | { type: 'frame'; capturedAt: Ms }
  | { type: 'stick'; x: number; y: number } // cualquier |x|+|y| > stickThreshold → puppet
  | { type: 'mode'; mode: Mode }
  | { type: 'gesture'; name: 'heart' | 'wave' }
  | { type: 'telemetry'; distCm: number | null; yawDeg: number | null }
  | { type: 'tick' };

// ---------- Constantes del lazo (lo que se tunea con el chasis real) ----------
export const T = {
  stickThreshold: 0.05,
  stickDeadmanMs: 500, // stick más viejo que esto → drive 0
  detectionMaxAgeMs: 1500, // detección más vieja que esto se descarta
  confirmHits: 2, // detecciones seguidas para pasar de searching a chasing
  minConfidence: 0.6,
  lostAfterMs: 1500, // sin ver target en chasing/found → lost
  foundSizeMin: 0.35, // target.size ≥ esto (o distCm < foundDistCm) → found
  foundDistCm: 30,
  celebrateMs: 4000,
  sadMs: 3000,
  reunionWindowMs: 20000, // lost → found dentro de esta ventana = party
  spinFlipMs: 3000,
  espOfflineMs: 1000,
  cameraLostMs: 3000, // sin frames en auto → STOP
  obstacleCm: 20, // el firmware frena a 15; acá evitamos pedir lo imposible
  gestureMs: 2000,
  chase: { forward: 0.5, kTurn: 0.8, centerTol: 0.25 },
  searchSpin: 0.35,
} as const;

export function initialState(now: Ms): RobotState {
  // Arranca en puppet: nadie se mueve solo hasta apretar "Auto".
  throw new Error('not implemented');
}

/** Puro. Idempotente frente a eventos repetidos, detecciones fuera de orden y ticks redundantes. */
export function reduce(s: RobotState, e: BrainEvent, now: Ms): RobotState {
  switch (e.type) {
    case 'detection':
      // TODO if (e.detection.frameId <= (s.target?.frameId ?? -1)) return s;          // fuera de orden
      // TODO if (now - e.detection.capturedAt > T.detectionMaxAgeMs) return s;        // frame viejo
      // TODO if (!e.detection.target || confidence < T.minConfidence) → hits = 0; return (no borra target: lo hace el tick por edad)
      // TODO target = toTarget(e.detection); hits += 1; behavior = stepBehavior(s, now)  (solo en mode auto)
      throw new Error('not implemented');
    case 'frame':
      throw new Error('not implemented'); // lastFrameAt = e.capturedAt
    case 'stick':
      // TODO stick = {x, y, at: now}; if (|x|+|y| > T.stickThreshold) mode = 'puppet'  (el humano gana sin botón)
      throw new Error('not implemented');
    case 'mode':
      // TODO if (e.mode === s.mode) return s; al entrar a auto: behavior = searching(now), hits = 0
      throw new Error('not implemented');
    case 'gesture':
      throw new Error('not implemented'); // gesture = {name, until: now + T.gestureMs}
    case 'telemetry':
      throw new Error('not implemented'); // esp = {lastTelemetryAt: now, distCm, yawDeg}
    case 'tick':
      // TODO gesture expirado → null
      // TODO behavior por tiempo (solo auto):
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

/** Puro y derivado. Arbitraje humano/IA y clamp de seguridad en un solo lugar. */
export function plan(s: RobotState, now: Ms): ActuatorCommand {
  // TODO drive =
  //   mode === 'puppet' ? (now - stick.at > T.stickDeadmanMs ? STOP : mix(stick))   // mix: left = y + x, right = y - x, clamp
  //   : behavior.kind === 'searching' ? spin(spinDir)
  //   : behavior.kind === 'chasing'   ? chase(target, now)  // P sobre (cx - 0.5) con decay por edad del target
  //   : behavior.kind === 'found'     ? (party ? twirl(now) : STOP)
  //   : STOP (lost)
  // TODO clampSafety: en auto sin frames frescos (cameraLostMs) → STOP; distCm < obstacleCm → sin avance
  // TODO servo = gesture ?? poseFor(behavior)  (found: 180/0 corazón; lost: 30/150 caídos; default 90/90)
  // TODO tone = puppet ? 0 : found ? (party ? 4 : 2) : lost ? 3 : chasing recién entrado (< 300 ms) ? 1 : 0
  throw new Error('not implemented');
}

export function moodOf(s: RobotState, now: Ms): Mood {
  // offline (sin telemetría) > puppet > found&party → party > behavior.kind
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
