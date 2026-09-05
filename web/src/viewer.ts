// #viewer — jurado. Read-only, N instancias. Canvas con el último JPEG + overlay (bbox si el target es fresco,
// label grande con mood/behavior y caption, acción vigente del LLM). También lo reutiliza #control.
import type { StateMsg } from '@gaucho/protocol';
import { RobotSocket } from './ws';
import { FACE } from './face';

export interface ViewerCanvas {
  canvas: HTMLCanvasElement;
  showFrame(frameId: number, jpeg: Blob): Promise<void>; // createImageBitmap + drawImage
  showState(s: StateMsg): void; // guarda el último state; el overlay se dibuja sobre el próximo frame
}

function formatHeader(s: StateMsg): string {
  const esp = s.esp.online ? `esp ✓ ${s.esp.distCm ?? '?'}cm` : 'esp ✗';
  const lat = s.reader.latencyMs != null ? `${s.reader.latencyMs}ms` : '—';
  return `${FACE[s.mood].emoji} ${s.behavior} · ${esp} · ${s.reader.kind} ${lat} ${s.reader.fps.toFixed(1)}fps`;
}

export function formatAction(s: StateMsg): string {
  if (!s.action) return '—';
  return `→ ${s.action.kind} ${s.action.speed.toFixed(1)} (${s.action.remainingMs} ms)`;
}

function confidenceColor(confidence: number): string {
  if (confidence >= 0.7) return '#22c55e';
  if (confidence >= 0.4) return '#eab308';
  return '#ef4444';
}

const TARGET_MAX_AGE_MS = 4000; // = T.lostAfterMs del server; ageMs se mide desde el frame, y Gemini tarda ~2 s

function drawOverlay(ctx: CanvasRenderingContext2D, s: StateMsg, W: number, H: number): void {
  if (s.target && s.target.ageMs < TARGET_MAX_AGE_MS) {
    const t = s.target;
    const side = t.size * Math.max(W, H);
    const x = t.cx * W - side / 2;
    const y = t.cy * H - side / 2;
    ctx.strokeStyle = confidenceColor(t.confidence);
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, side, side);
  }

  const label = `${FACE[s.mood].emoji} ${s.behavior}`;
  ctx.font = '16px system-ui, sans-serif';
  const tw = ctx.measureText(label).width;
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(8, 8, tw + 16, 28);
  ctx.fillStyle = '#fff';
  ctx.fillText(label, 16, 28);
}

export function drawViewer(root: HTMLElement): ViewerCanvas {
  let state: StateMsg | null = null;

  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'viewer';

  const header = document.createElement('div');
  header.className = 'viewer-header';
  header.textContent = '…';

  const canvas = document.createElement('canvas');
  canvas.className = 'viewer-canvas';

  const caption = document.createElement('div');
  caption.className = 'viewer-caption';

  const action = document.createElement('div');
  action.className = 'viewer-action';

  wrap.append(header, canvas, caption, action);
  root.append(wrap);

  function showState(s: StateMsg): void {
    state = s;
    header.textContent = formatHeader(s);
    caption.textContent = s.caption;
    action.textContent = formatAction(s);
  }

  async function showFrame(_frameId: number, jpeg: Blob): Promise<void> {
    const bitmap = await createImageBitmap(jpeg);
    if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return;
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    if (state) drawOverlay(ctx, state, canvas.width, canvas.height);
  }

  return { canvas, showFrame, showState };
}

export function mountViewer(root: HTMLElement): void {
  const ws = new RobotSocket('viewer');
  const view = drawViewer(root);
  ws.onFrame((id, jpeg) => void view.showFrame(id, jpeg));
  ws.onState((s) => view.showState(s));
}
