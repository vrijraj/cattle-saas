import { lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { rateLimitBuckets } from "@/db/schema";
import { checkRateLimit, type RateLimitResult } from "@/lib/rate-limit";

/**
 * Multi-instance distributed rate limiter backed by PostgreSQL (and PGlite locally).
 * Uses a single atomic INSERT ... ON CONFLICT DO UPDATE statement so horizontal replicas
 * enforce shared quotas without requiring Redis. Falls back to in-memory limiter on DB error.
 */
export async function checkDistributedRateLimit(
  key: string,
  options: { limit: number; windowMs: number },
  nowMs = Date.now(),
): Promise<RateLimitResult> {
  const now = new Date(nowMs);
  const nextReset = new Date(nowMs + options.windowMs);

  try {
    const [row] = await db
      .insert(rateLimitBuckets)
      .values({ key, count: 1, resetAt: nextReset })
      .onConflictDoUpdate({
        target: rateLimitBuckets.key,
        set: {
          count: sql`CASE WHEN ${rateLimitBuckets.resetAt} <= ${now} THEN 1 ELSE ${rateLimitBuckets.count} + 1 END`,
          resetAt: sql`CASE WHEN ${rateLimitBuckets.resetAt} <= ${now} THEN ${nextReset} ELSE ${rateLimitBuckets.resetAt} END`,
        },
      })
      .returning({ count: rateLimitBuckets.count, resetAt: rateLimitBuckets.resetAt });

    if (!row) return checkRateLimit(key, options, nowMs);

    // Opportunistic expired-bucket cleanup (~1% of calls)
    if (Math.random() < 0.01) {
      void db.delete(rateLimitBuckets).where(lt(rateLimitBuckets.resetAt, now)).catch(() => {});
    }

    if (row.count > options.limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((row.resetAt.getTime() - nowMs) / 1000));
      return { allowed: false, remaining: 0, retryAfterSeconds };
    }
    return {
      allowed: true,
      remaining: Math.max(0, options.limit - row.count),
      retryAfterSeconds: 0,
    };
  } catch {
    return checkRateLimit(key, options, nowMs);
  }
}
