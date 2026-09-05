// #control — la laptop o un celu del equipo. El robot es autónomo: acá no se maneja, se arranca y se para.
//   botones: [Arrancar] [Parar]  ·  reader: [gemini | mock | manual]
//   video con overlay (reutiliza viewer) + header: esp online/offline, distCm, reader kind + latencyMs, fps, clientes
//   caption del LLM ("pensamiento") y la acción vigente con su tiempo restante
//   tap sobre el video → {t:'mark', x, y}  — solo tiene efecto con reader manual (desarrollo)
import { ReaderKind, type StateMsg } from '@gaucho/protocol';
import { RobotSocket } from './ws';
import { drawViewer, formatAction } from './viewer';
import { FACE } from './face';

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function formatControlHeader(s: StateMsg): string {
  const run = s.run === 'running' ? '▶ running' : '■ stopped';
  const esp = s.esp.online ? `esp ✓ ${s.esp.distCm ?? '?'}cm` : 'esp ✗';
  const lat = s.reader.latencyMs != null ? `${s.reader.latencyMs}ms` : '—';
  const clients = `face:${s.clients.face} ctrl:${s.clients.control} view:${s.clients.viewer}`;
  const drive = `L${s.drive.left.toFixed(2)} R${s.drive.right.toFixed(2)}`;
  return `${run} · ${FACE[s.mood].emoji} ${s.mood} · ${esp} · ${s.reader.kind} ${lat} ${s.reader.fps.toFixed(1)}fps · ${clients} · ${drive}`;
}

export function mountControl(root: HTMLElement): void {
  const ws = new RobotSocket('control');

  root.className = 'control';
  root.innerHTML = '';

  const conn = document.createElement('div');
  conn.className = 'control-conn';
  conn.textContent = '● desconectado';

  const header = document.createElement('div');
  header.className = 'control-header';
  header.textContent = '…';

  const viewerRoot = document.createElement('div');
  viewerRoot.className = 'control-viewer';

  const hint = document.createElement('div');
  hint.className = 'control-hint';
  hint.textContent = 'tap = marcar a Gaucho (solo reader manual)';

  const controls = document.createElement('div');
  controls.className = 'control-buttons';

  const runBtn = document.createElement('button');
  runBtn.type = 'button';
  runBtn.className = 'btn btn-run';
  runBtn.textContent = 'Arrancar';

  const stopBtn = document.createElement('button');
  stopBtn.type = 'button';
  stopBtn.className = 'btn btn-stop';
  stopBtn.textContent = 'Parar';

  const readerSelect = document.createElement('select');
  readerSelect.className = 'reader-select';
  for (const kind of ReaderKind.options) {
    const opt = document.createElement('option');
    opt.value = kind;
    opt.textContent = kind;
    readerSelect.append(opt);
  }

  controls.append(runBtn, stopBtn, readerSelect);

  const caption = document.createElement('div');
  caption.className = 'control-caption';

  const actionEl = document.createElement('div');
  actionEl.className = 'control-action';

  root.append(conn, header, viewerRoot, hint, controls, caption, actionEl);

  const view = drawViewer(viewerRoot);

  view.canvas.addEventListener('click', (ev) => {
    const rect = view.canvas.getBoundingClientRect();
    const x = clamp((ev.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((ev.clientY - rect.top) / rect.height, 0, 1);
    ws.send({ t: 'mark', x, y });
  });

  runBtn.addEventListener('click', () => ws.send({ t: 'run', run: 'running' }));
  stopBtn.addEventListener('click', () => ws.send({ t: 'run', run: 'stopped' }));

  readerSelect.addEventListener('change', () => {
    const parsed = ReaderKind.safeParse(readerSelect.value);
    if (parsed.success) ws.send({ t: 'reader', kind: parsed.data });
  });

  ws.onFrame((id, jpeg) => void view.showFrame(id, jpeg));

  ws.onState((s) => {
    view.showState(s);
    header.textContent = formatControlHeader(s);
    readerSelect.value = s.reader.kind;
    caption.textContent = s.caption;
    actionEl.textContent = formatAction(s);
  });

  ws.onConnection((c) => {
    conn.textContent = c ? '● conectado' : '● desconectado';
    conn.classList.toggle('online', c);
  });
}
