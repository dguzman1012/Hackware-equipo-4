// #control — la laptop o un celu del equipo. El robot es autónomo: acá no se maneja, se arranca y se para.
//   botones: [Arrancar] [Parar]  ·  reader: [gemini | mock | manual]
//   video con overlay (reutiliza viewer) + header: esp online/offline, distCm, reader kind + latencyMs, fps, clientes
//   caption del LLM ("pensamiento") y la acción vigente con su tiempo restante
//   tap sobre el video → {t:'mark', x, y}  — solo tiene efecto con reader manual (desarrollo)
import { RobotSocket } from './ws';
import { drawViewer } from './viewer';

export function mountControl(root: HTMLElement): void {
  const ws = new RobotSocket('control');
  void ws;
  void drawViewer;
  void root;
  throw new Error('not implemented');
}
