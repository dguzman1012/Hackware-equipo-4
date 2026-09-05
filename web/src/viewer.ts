// #viewer — jurado. Read-only, N instancias. Canvas con el último JPEG + overlay (bbox si target.ageMs < 1500,
// label grande con mood/behavior y caption). También lo reutiliza #pilot.
import type { StateMsg } from '@gaucho/protocol';
import { RobotSocket } from './ws';

export interface ViewerCanvas {
  canvas: HTMLCanvasElement;
  showFrame(frameId: number, jpeg: Blob): Promise<void>; // createImageBitmap + drawImage
  showState(s: StateMsg): void; // guarda el último state; el overlay se dibuja sobre el próximo frame
}

export function drawViewer(root: HTMLElement): ViewerCanvas {
  throw new Error('not implemented');
}

export function mountViewer(root: HTMLElement): void {
  const ws = new RobotSocket('viewer');
  const view = drawViewer(root);
  ws.onFrame((id, jpeg) => void view.showFrame(id, jpeg));
  ws.onState((s) => view.showState(s));
}
