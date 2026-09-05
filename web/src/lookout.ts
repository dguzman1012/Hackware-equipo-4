// #lookout — celu fijo en estante/trípode, mirando al piso. Solo cámara; no cara ni audio.
import { Camera, cameraOptionsFromUrl } from './camera';
import { RobotSocket } from './ws';

export function mountLookout(root: HTMLElement): void {
  const video = document.getElementById('cam');
  if (!(video instanceof HTMLVideoElement)) throw new Error('#cam missing');

  const ws = new RobotSocket('lookout');
  const camera = new Camera(video);
  const opts = cameraOptionsFromUrl(location.search, 'environment');

  let frameCount = 0;
  let fpsWindow = 0;
  let fpsDisplay = 0;
  let connected = false;
  let started = false;

  root.className = 'lookout';
  root.innerHTML = `
    <div class="lookout-status" id="lookout-status">desconectado · 0 frames · 0 fps</div>
    <button class="face-start" id="lookout-start" type="button">Iniciar</button>
  `;

  const statusEl = root.querySelector('#lookout-status') as HTMLElement;
  const startBtn = root.querySelector('#lookout-start') as HTMLButtonElement;

  function updateStatus(): void {
    statusEl.textContent = `${connected ? 'conectado' : 'desconectado'} · ${frameCount} frames · ${fpsDisplay} fps`;
  }

  setInterval(() => {
    fpsDisplay = fpsWindow;
    fpsWindow = 0;
    updateStatus();
  }, 1000);

  async function requestWakeLock(): Promise<void> {
    try {
      await navigator.wakeLock?.request('screen');
    } catch {
      // unsupported or denied
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void requestWakeLock();
  });

  function sendFrameMeta(): void {
    ws.send({ t: 'frame_meta', width: opts.width, height: opts.height });
  }

  ws.onConnection((c) => {
    connected = c;
    if (c && started) sendFrameMeta();
    updateStatus();
  });

  startBtn.addEventListener('click', () => {
    void (async () => {
      try {
        await camera.start(opts, (blob) => {
          ws.sendFrame(blob);
          frameCount++;
          fpsWindow++;
          updateStatus();
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        statusEl.textContent = `Cámara: ${msg}. Abrí por https o localhost.`;
        return;
      }

      void requestWakeLock();
      started = true;
      sendFrameMeta();
      startBtn.hidden = true;
    })();
  });
}
