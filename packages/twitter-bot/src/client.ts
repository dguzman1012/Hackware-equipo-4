// Postea o, sin credenciales, solo loguea. Así el scheduler se prueba entero
// antes de que exista la cuenta de X.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TweetDraft } from './content';
import type { Env } from './env';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, '../../..');

export interface TweetClient {
  postTweet(tweet: TweetDraft): Promise<void>;
}

export function makeClient(env: Env): TweetClient {
  if (env.dryRun || !env.credentials) {
    return {
      async postTweet(tweet) {
        const suffix = tweet.mediaPath ? ` (con foto ${tweet.mediaPath})` : '';
        console.log(`[DRY RUN] tuitearía${suffix}: "${tweet.text}"`);
      },
    };
  }

  const { apiKey, apiSecret, accessToken, accessSecret } = env.credentials;
  return {
    async postTweet(tweet) {
      const { TwitterApi } = await import('twitter-api-v2');
      const client = new TwitterApi({
        appKey: apiKey,
        appSecret: apiSecret,
        accessToken,
        accessSecret,
      });

      if (tweet.mediaPath) {
        const mediaId = await client.v1.uploadMedia(path.resolve(repoRoot, tweet.mediaPath));
        await client.v2.tweet(tweet.text, { media: { media_ids: [mediaId] } });
      } else {
        await client.v2.tweet(tweet.text);
      }
    },
  };
}
