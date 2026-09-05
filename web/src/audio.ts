// Clips en web/public/sounds/*.mp3, precargados en el gesto de "Iniciar". play() corta el anterior.
import type { Mood } from '@gaucho/protocol';

export type Clip = 'love' | 'sad' | 'party' | 'beep';

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
  /** Llamar dentro de un gesto: crea/resume AudioContext y precarga los 4 clips. */
  async unlock(): Promise<void> {
    throw new Error('not implemented');
  }
  play(clip: Clip): void {
    throw new Error('not implemented');
  }
  stop(): void {
    throw new Error('not implemented');
  }
}
