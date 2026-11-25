type Bucket = {
  hits: number[];
};

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export function checkRateLimit(
  key: string,
  options: { limit: number; windowMs: number },
  now = Date.now(),
): RateLimitResult {
  const cutoff = now - options.windowMs;
  const existing = buckets.get(key);
  const hits = existing ? existing.hits.filter((stamp) => stamp > cutoff) : [];

  if (hits.length >= options.limit) {
    const oldest = hits[0] ?? now;
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + options.windowMs - now) / 1000));
    buckets.set(key, { hits });
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  hits.push(now);
  if (buckets.size >= MAX_BUCKETS && !buckets.has(key)) {
    const firstKey = buckets.keys().next().value;
    if (firstKey) buckets.delete(firstKey);
  }
  buckets.set(key, { hits });
  return {
    allowed: true,
    remaining: Math.max(0, options.limit - hits.length),
    retryAfterSeconds: 0,
  };
}

export function clearRateLimits() {
  buckets.clear();
}

export function clientIpFromHeaders(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return headers.get("x-real-ip")?.trim() || headers.get("cf-connecting-ip")?.trim() || "unknown";
}
