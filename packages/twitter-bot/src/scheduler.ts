import type { TweetDraft } from './content';
import type { State } from './state';

export interface Pick {
  tweet: TweetDraft;
  nextState: State;
}

// Puro: dado el estado y la lista, elige el próximo tweet y calcula el
// próximo estado. Al agotar la lista, vuelve a empezar desde el principio.
export function pickNext(state: State, tweets: TweetDraft[], now: number): Pick {
  if (tweets.length === 0) throw new Error('no hay tweets para postear');
  const index = state.nextIndex % tweets.length;
  const tweet = tweets[index]!;
  const nextIndex = (index + 1) % tweets.length;
  return {
    tweet,
    nextState: {
      nextIndex,
      history: [...state.history, { id: tweet.id, postedAt: now }],
    },
  };
}

export interface RunLoopDeps {
  tweets: TweetDraft[];
  intervalMs: number;
  loadState: () => State;
  saveState: (state: State) => void;
  postTweet: (text: string) => Promise<void>;
  now?: () => number;
}

export function runLoop(deps: RunLoopDeps): () => void {
  const now = deps.now ?? Date.now;

  const tick = async () => {
    const state = deps.loadState();
    const { tweet, nextState } = pickNext(state, deps.tweets, now());
    await deps.postTweet(tweet.text);
    deps.saveState(nextState);
  };

  void tick();
  const timer = setInterval(() => void tick(), deps.intervalMs);
  return () => clearInterval(timer);
}
