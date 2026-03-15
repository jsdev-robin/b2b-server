import { Redis } from '@upstash/redis';
import { createClient, type RedisClientType } from 'redis';

export const nodeClient: RedisClientType = createClient({
  url: process.env.REDIS_URL,
});

export const upstashClient = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

nodeClient.on('error', function (err) {
  throw err;
});
