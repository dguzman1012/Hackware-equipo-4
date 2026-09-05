// #face — el celu montado en el robot. Pantalla completa: emoji gigante + fondo por mood + caption; cámara y audio.
// Botón "Iniciar" (gesto) → Camera.start + AudioPlayer.unlock + navigator.wakeLock.request('screen') + frame_meta.
// onState: render(mood, caption); if (mood !== prev) audio.play(clipFor(mood)) — idempotente ante snapshots repetidos.
import type { Mood } from '@gaucho/protocol';
import { AudioPlayer } from './audio';
import { Camera, cameraOptionsFromUrl } from './camera';
import { RobotSocket } from './ws';

export const FACE: Record<Mood, { emoji: string; bg: string }> = {
  searching: { emoji: '👀', bg: '#1e3a8a' },
  chasing: { emoji: '😍', bg: '#db2777' },
  found: { emoji: '❤️', bg: '#dc2626' },
  party: { emoji: '🎉', bg: '#7c3aed' },
  lost: { emoji: '😢', bg: '#4b5563' },
  puppet: { emoji: '🎮', bg: '#6d28d9' },
  offline: { emoji: '💤', bg: '#000000' },
};

export function mountFace(root: HTMLElement): void {
  const video = document.getElementById('cam');
  if (!(video instanceof HTMLVideoElement)) throw new Error('#cam missing');
  const ws = new RobotSocket('face');
  const camera = new Camera(video);
  const audio = new AudioPlayer();
  const opts = cameraOptionsFromUrl(location.search);
  void ws;
  void camera;
  void audio;
  void opts;
  void root;
  throw new Error('not implemented');
}
