import { Request, Response, NextFunction } from "express";

interface BucketEntry {
  tokens: number;
  lastRefill: number;
}

/**
 * Token-bucket rate limiter per IP.
 * Default: 60 requests per minute, burst up to 20.
 */
export function rateLimiter(opts: {
  maxTokens?: number;
  refillRate?: number;
  windowMs?: number;
  maxTrackedIPs?: number;
} = {}) {
  const maxTokens = opts.maxTokens ?? 20;
  const refillRate = opts.refillRate ?? 60;
  const windowMs = opts.windowMs ?? 60_000;
  const maxTrackedIPs = opts.maxTrackedIPs ?? 50_000;

  const buckets = new Map<string, BucketEntry>();
  let lastEviction = Date.now();
  const EVICTION_INTERVAL_MS = 5 * 60_000;

  function evictStale(now: number): void {
    if (now - lastEviction < EVICTION_INTERVAL_MS) return;
    lastEviction = now;
    const staleThreshold = now - windowMs * 5;
    for (const [ip, entry] of buckets) {
      if (entry.lastRefill < staleThreshold) {
        buckets.delete(ip);
      }
    }
  }

  function getClientIP(req: Request): string {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
    return req.ip ?? req.socket.remoteAddress ?? "unknown";
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    evictStale(now);

    const ip = getClientIP(req);
    let bucket = buckets.get(ip);

    if (!bucket) {
      if (buckets.size >= maxTrackedIPs) {
        res.status(503).json({ error: "server busy" });
        return;
      }
      bucket = { tokens: maxTokens, lastRefill: now };
      buckets.set(ip, bucket);
    }

    const elapsed = now - bucket.lastRefill;
    const refill = (elapsed / windowMs) * refillRate;
    bucket.tokens = Math.min(maxTokens, bucket.tokens + refill);
    bucket.lastRefill = now;

    if (bucket.tokens < 1) {
      const retryAfter = Math.ceil(((1 - bucket.tokens) / refillRate) * windowMs / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({ error: "too many requests" });
      return;
    }

    bucket.tokens -= 1;
    next();
  };
}
