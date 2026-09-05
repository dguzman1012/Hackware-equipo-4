import type { TweetDraft } from './content';
import type { State } from './state';

export interface Pick {
  tweet: TweetDraft;
  nextState: State;
}

// Puro: dado el estado y la lista, elige el próximo tweet y calcula el
// próximo estado. Nunca repite: agotada la lista, devuelve null.
export function pickNext(state: State, tweets: TweetDraft[], now: number): Pick | null {
  if (state.nextIndex >= tweets.length) return null;
  const tweet = tweets[state.nextIndex]!;
  return {
    tweet,
    nextState: {
      nextIndex: state.nextIndex + 1,
      history: [...state.history, { id: tweet.id, postedAt: now }],
    },
  };
}

export interface RunLoopDeps {
  tweets: TweetDraft[];
  intervalMs: number;
  loadState: () => State;
  saveState: (state: State) => void;
  postTweet: (tweet: TweetDraft) => Promise<void>;
  now?: () => number;
}

export function runLoop(deps: RunLoopDeps): () => void {
  const now = deps.now ?? Date.now;
  let timer: ReturnType<typeof setInterval> | undefined;

  const tick = async () => {
    const state = deps.loadState();
    const result = pickNext(state, deps.tweets, now());
    if (!result) {
      console.log('[twitter-bot] no quedan tweets nuevos — deteniendo (nunca repite).');
      if (timer) clearInterval(timer);
      return;
    }
    const { tweet, nextState } = result;
    try {
      await deps.postTweet(tweet);
      deps.saveState(nextState);
    } catch (err) {
      // No avanza el estado: reintenta el mismo tweet en el próximo intervalo
      // en vez de tirar abajo todo el proceso por un error de red transitorio.
      console.error(
        `[twitter-bot] error posteando "${tweet.id}", reintento en el próximo intervalo:`,
        err instanceof Error ? err.message : err,
      );
    }
  };

  void tick();
  timer = setInterval(() => void tick(), deps.intervalMs);
  return () => {
    if (timer) clearInterval(timer);
  };
}
