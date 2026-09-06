// Clips WAV de mood + frases habladas cada 15 s (speechSynthesis).
import type { Mood } from '@gaucho/protocol';

export type Clip = 'love' | 'sad' | 'party' | 'beep';

const ALL_CLIPS: Clip[] = ['love', 'sad', 'party', 'beep'];

const SEEK_LINES = [
  'Gauchito, ¿dónde estás?',
  'Te amo, Gauchito, porfa',
  'Gauchito, salí, te busco',
  '¿Dónde te metiste, Gauchito?',
  'Gauchito, no te veo, porfa',
  'Vení, Gauchito, te extraño',
] as const;

const FOUND_LINES = [
  'Te amo, gracias por mirarme',
  'Gauchito, te encontré, te amo',
  'Gracias por mirarme, Gauchito',
  'Te amo, no me dejes de mirar',
  'Ahí estás, te amo, Gauchito',
] as const;

export function clipFor(mood: Mood): Clip {
  switch (mood) {
    case 'found':
    case 'chasing':
      return 'love';
    case 'party':
      return 'party';
    case 'lost':
    case 'stopped':
      return 'sad';
    case 'searching':
    case 'offline':
      return 'beep';
    default: {
      const _exhaustive: never = mood;
      return _exhaustive;
    }
  }
}

function poolFor(mood: Mood): readonly string[] {
  switch (mood) {
    case 'chasing':
    case 'found':
    case 'party':
      return FOUND_LINES;
    case 'searching':
    case 'lost':
    case 'stopped':
    case 'offline':
      return SEEK_LINES;
    default: {
      const _exhaustive: never = mood;
      return _exhaustive;
    }
  }
}

export function phraseFor(mood: Mood, n: number): string {
  const pool = poolFor(mood);
  return pool[n % pool.length]!;
}

export function unlockSpeech(): void {
  if (!('speechSynthesis' in window)) return;
  const warm = new SpeechSynthesisUtterance('hola');
  warm.lang = 'es-AR';
  warm.rate = 1.05;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(warm);
}

export function speak(text: string): void {
  const line = text.trim();
  if (!line || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(line);
  u.lang = 'es-AR';
  u.rate = 1.05;
  window.speechSynthesis.speak(u);
}

export class AudioPlayer {
  private readonly elements = new Map<Clip, HTMLAudioElement>();

  constructor() {
    for (const clip of ALL_CLIPS) {
      const el = new Audio(`/sounds/${clip}.wav`);
      el.preload = 'auto';
      this.elements.set(clip, el);
    }
  }

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
    el.loop = false;
    el.currentTime = 0;
    void el.play().catch(() => {});
  }

  stop(): void {
    for (const el of this.elements.values()) {
      el.loop = false;
      el.pause();
      el.currentTime = 0;
    }
  }
}
