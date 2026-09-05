// getUserMedia + canvas → JPEG. Requiere secure context (https con CA confiable en iOS).
// Cámara FRONTAL por default: el celu va montado con la pantalla (cara) mirando hacia adelante, así cámara y cara
// miran para el mismo lado. ?cam=environment para usar la trasera.

export interface CameraOptions {
  facing: 'user' | 'environment';
  width: number; // 480
  height: number; // 360
  fps: number; // 5
  quality: number; // 0.6
}

export const DEFAULT_CAMERA: CameraOptions = { facing: 'user', width: 480, height: 360, fps: 5, quality: 0.6 };

export function cameraOptionsFromUrl(search: string): CameraOptions {
  const cam = new URLSearchParams(search).get('cam');
  return { ...DEFAULT_CAMERA, facing: cam === 'environment' ? 'environment' : 'user' };
}

export class Camera {
  constructor(private readonly video: HTMLVideoElement) {}

  /** Debe llamarse desde un gesto del usuario. setInterval a fps: drawImage → canvas.toBlob('image/jpeg', quality). */
  async start(opts: CameraOptions, onJpeg: (b: Blob, dims: { width: number; height: number }) => void): Promise<void> {
    throw new Error('not implemented');
  }
  stop(): void {
    throw new Error('not implemented');
  }
}
