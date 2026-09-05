// #pilot — operador (modo marioneta y controles). Video + joystick + botones.
//   joystick: cada 100 ms mientras toca → {t:'stick', x, y}; al soltar → {x:0, y:0} una vez (el server tiene dead-man igual)
//   botones: [Auto] [Marioneta] [❤️ heart] [👋 wave] [IA: gemini | manual | mock]
//   tap sobre el video → {t:'mark', x: px/w, y: py/h}  (detector manual = mago de Oz)
//   header: esp online/offline, distCm, detector kind + latencyMs, fps, clientes conectados
import { RobotSocket } from './ws';
import { drawViewer } from './viewer';

export function mountPilot(root: HTMLElement): void {
  const ws = new RobotSocket('pilot');
  void ws;
  void drawViewer;
  void root;
  throw new Error('not implemented');
}
