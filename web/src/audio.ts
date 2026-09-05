// Clips en web/public/sounds/*.mp3, precargados en el gesto de "Iniciar". play() corta el anterior.
import type { Mood } from '@gaucho/protocol';

export type Clip = 'love' | 'sad' | 'party' | 'beep';

const ALL_CLIPS: Clip[] = ['love', 'sad', 'party', 'beep'];

export function clipFor(mood: Mood): Clip | null {
  switch (mood) {
    case 'found':
      return 'love';
    case 'party':
      return 'party';
    case 'lost':
      return 'sad';
    case 'chasing':
      return 'beep';
    case 'searching':
    case 'stopped':
    case 'offline':
      return null;
    default: {
      const _exhaustive: never = mood;
      return _exhaustive;
    }
  }
}

export class AudioPlayer {
  private readonly elements = new Map<Clip, HTMLAudioElement>();

  constructor() {
    for (const clip of ALL_CLIPS) {
      const el = new Audio(`/sounds/${clip}.mp3`);
      el.preload = 'auto';
      this.elements.set(clip, el);
    }
  }

  /** Llamar dentro de un gesto: crea/resume AudioContext y precarga los 4 clips. */
  async unlock(): Promise<void> {
    for (const el of this.elements.values()) {
      el.load();
      try {
        await el.play();
        el.pause();
        el.currentTime = 0;
      } catch {
        // missing file or autoplay policy
      }
    }
  }

  play(clip: Clip): void {
    this.stop();
    const el = this.elements.get(clip);
    if (!el) return;
    el.currentTime = 0;
    void el.play().catch(() => {});
  }

  stop(): void {
    for (const el of this.elements.values()) {
      el.pause();
      el.currentTime = 0;
    }
  }
}
