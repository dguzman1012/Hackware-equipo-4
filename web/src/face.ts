// #face — el celu montado en el robot. Pantalla completa: emoji gigante + fondo por mood + caption; cámara y audio.
// Botón "Iniciar" (gesto) → Camera.start + AudioPlayer.unlock + navigator.wakeLock.request('screen') + frame_meta.
// onState: render(mood, caption); if (mood !== prev) audio.play(clipFor(mood)) — idempotente ante snapshots repetidos.
import type { Mood } from '@gaucho/protocol';
import { AudioPlayer, clipFor } from './audio';
import { Camera, cameraOptionsFromUrl } from './camera';
import { RobotSocket } from './ws';

export const FACE: Record<Mood, { emoji: string; bg: string }> = {
  searching: { emoji: '👀', bg: '#1e3a8a' },
  chasing: { emoji: '😍', bg: '#db2777' },
  found: { emoji: '❤️', bg: '#dc2626' },
  party: { emoji: '🎉', bg: '#7c3aed' },
  lost: { emoji: '😢', bg: '#4b5563' },
  stopped: { emoji: '😴', bg: '#374151' },
  offline: { emoji: '💤', bg: '#000000' },
};

export function mountFace(root: HTMLElement): void {
  const video = document.getElementById('cam');
  if (!(video instanceof HTMLVideoElement)) throw new Error('#cam missing');

  if (new URLSearchParams(location.search).get('debug') === '1') {
    document.body.classList.add('debug');
  }

  const ws = new RobotSocket('face');
  const camera = new Camera(video);
  const audio = new AudioPlayer();
  const opts = cameraOptionsFromUrl(location.search);

  let prevMood: Mood | null = null;
  let frameCount = 0;
  let fpsWindow = 0;
  let fpsDisplay = 0;
  let connected = false;
  let started = false;

  root.className = 'face';
  root.innerHTML = `
    <div class="face-emoji" id="face-emoji">${FACE.offline.emoji}</div>
    <div class="face-caption" id="face-caption"></div>
    <div class="face-status" id="face-status">desconectado · 0 frames · 0 fps</div>
    <button class="face-start" id="face-start" type="button">Iniciar</button>
  `;
  root.style.backgroundColor = FACE.offline.bg;

  const emojiEl = root.querySelector('#face-emoji') as HTMLElement;
  const captionEl = root.querySelector('#face-caption') as HTMLElement;
  const statusEl = root.querySelector('#face-status') as HTMLElement;
  const startBtn = root.querySelector('#face-start') as HTMLButtonElement;

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

  ws.onState((s) => {
    const face = FACE[s.mood];
    emojiEl.textContent = face.emoji;
    root.style.backgroundColor = face.bg;
    captionEl.textContent = s.caption;
    if (s.mood !== prevMood) {
      const clip = clipFor(s.mood);
      if (clip) audio.play(clip);
      else audio.stop();
      prevMood = s.mood;
    }
  });

  startBtn.addEventListener('click', () => {
    void (async () => {
      const camPromise = camera.start(opts, (blob) => {
        ws.sendFrame(blob);
        frameCount++;
        fpsWindow++;
        updateStatus();
      });

      try {
        await audio.unlock();
      } catch {
        // continue even if unlock fails
      }

      try {
        await camPromise;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        captionEl.textContent = `Cámara: ${msg}. Abrí por https o localhost.`;
        return;
      }

      void requestWakeLock();
      started = true;
      sendFrameMeta();
      startBtn.hidden = true;
    })();
  });
}
