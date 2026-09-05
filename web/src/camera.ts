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
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private stream: MediaStream | null = null;
  private encoding = false;
  private visibilityHandler: (() => void) | null = null;

  constructor(private readonly video: HTMLVideoElement) {}

  /** Debe llamarse desde un gesto del usuario. setInterval a fps: drawImage → canvas.toBlob('image/jpeg', quality). */
  async start(opts: CameraOptions, onJpeg: (b: Blob, dims: { width: number; height: number }) => void): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('getUserMedia requires HTTPS or localhost');
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: opts.facing,
          width: { ideal: opts.width },
          height: { ideal: opts.height },
          frameRate: { ideal: opts.fps + 5 },
        },
        audio: false,
      });
    } catch (e) {
      if (e instanceof OverconstrainedError) {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      } else {
        throw e;
      }
    }

    this.stream = stream;
    this.video.srcObject = stream;

    try {
      await this.video.play();
    } catch (e) {
      const abortedBySrcChange = e instanceof DOMException && e.name === 'AbortError';
      if (!abortedBySrcChange) throw e;
    }

    if (this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      await new Promise<void>((resolve, reject) => {
        const finish = (): void => {
          if (this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) resolve();
        };
        this.video.addEventListener('loadeddata', finish, { once: true });
        this.video.addEventListener('error', () => reject(new Error('video failed to load')), { once: true });
        window.setTimeout(() => {
          if (this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) resolve();
          else reject(new Error('video did not start'));
        }, 5000);
      });
    }

    const canvas = document.createElement('canvas');
    canvas.width = opts.width;
    canvas.height = opts.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d unavailable');

    const dims = { width: opts.width, height: opts.height };

    this.visibilityHandler = () => {
      if (document.visibilityState === 'visible') void this.video.play();
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);

    this.intervalId = setInterval(() => {
      if (this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || this.encoding) return;

      const vw = this.video.videoWidth;
      const vh = this.video.videoHeight;
      if (vw === 0 || vh === 0) return;

      const scale = Math.max(opts.width / vw, opts.height / vh);
      const sw = opts.width / scale;
      const sh = opts.height / scale;
      const sx = (vw - sw) / 2;
      const sy = (vh - sh) / 2;

      ctx.drawImage(this.video, sx, sy, sw, sh, 0, 0, opts.width, opts.height);
      this.encoding = true;
      canvas.toBlob(
        (b) => {
          this.encoding = false;
          if (b) onJpeg(b, dims);
        },
        'image/jpeg',
        opts.quality,
      );
    }, 1000 / opts.fps);
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.encoding = false;
  }
}
