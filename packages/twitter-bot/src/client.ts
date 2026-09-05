// Postea o, sin credenciales, solo loguea. Así el scheduler se prueba entero
// antes de que exista la cuenta de X.
import type { Env } from './env';

export interface TweetClient {
  postTweet(text: string): Promise<void>;
}

export function makeClient(env: Env): TweetClient {
  if (env.dryRun || !env.credentials) {
    return {
      async postTweet(text) {
        console.log(`[DRY RUN] tuitearía: "${text}"`);
      },
    };
  }

  const { apiKey, apiSecret, accessToken, accessSecret } = env.credentials;
  return {
    async postTweet(text) {
      const { TwitterApi } = await import('twitter-api-v2');
      const client = new TwitterApi({
        appKey: apiKey,
        appSecret: apiSecret,
        accessToken,
        accessSecret,
      });
      await client.v2.tweet(text);
    },
  };
}
