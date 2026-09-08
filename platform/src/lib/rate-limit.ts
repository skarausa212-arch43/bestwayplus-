import Redis from 'ioredis';

let redis: Redis | null = null;
function client(): Redis {
  redis ??= new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: 2 });
  return redis;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Fixed-window counter. Deliberately simple: the goal is to blunt credential
 * stuffing and signed-URL harvesting, not to be a perfect limiter.
 */
export async function rateLimit(
  key: string,
  { limit, windowSeconds }: { limit: number; windowSeconds: number },
): Promise<RateLimitResult> {
  const bucket = `rl:${key}:${Math.floor(Date.now() / 1000 / windowSeconds)}`;
  const count = await client().incr(bucket);
  if (count === 1) await client().expire(bucket, windowSeconds);
  const ttl = await client().ttl(bucket);

  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: ttl > 0 ? ttl : windowSeconds,
  };
}

export const LIMITS = {
  login: { limit: 5, windowSeconds: 900 },
  register: { limit: 3, windowSeconds: 3600 },
  passwordReset: { limit: 3, windowSeconds: 3600 },
  uploadIntent: { limit: 30, windowSeconds: 600 },
  downloadUrl: { limit: 60, windowSeconds: 600 },
  shareView: { limit: 20, windowSeconds: 600 },
} as const;
