// Decide cuándo el hallazgo de Gaucho (RobotState.behavior) dispara un tweet
// en vivo. Puro: nada de red ni de tiempo real acá (eso lo hace main.ts con
// twitter-bot). Cooldown aparte del hysteresis de brain.ts: una detección
// que parpadea found→lost→found no debe mandar un tweet por segundo.
import type { Behavior, Ms, RobotState } from './brain';

export const FOUND_TWEET_COOLDOWN_MS = 10 * 60 * 1000;

export const FOUND_TWEET_TEXT = '¡MI AMOR, TE ENCONTRÉ! AHORA NO TE ME VAS A DESPEGAR NUNCA!';

export function shouldTweetFound(
  prevBehaviorKind: Behavior['kind'] | null,
  state: RobotState,
  lastFoundTweetAt: Ms,
  now: Ms,
  cooldownMs: Ms = FOUND_TWEET_COOLDOWN_MS,
): boolean {
  return (
    state.behavior.kind === 'found' &&
    prevBehaviorKind !== 'found' &&
    now - lastFoundTweetAt > cooldownMs
  );
}
