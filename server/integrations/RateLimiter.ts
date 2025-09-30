type Bucket = {
  capacity: number;
  tokens: number;
  refillRatePerSec: number;
  lastRefill: number;
};

const DEFAULTS: Record<string, { rps: number; burst: number }> = {
  slack: { rps: 1, burst: 3 },
  stripe: { rps: 10, burst: 20 },
  hubspot: { rps: 5, burst: 10 },
  github: { rps: 10, burst: 20 },
  zendesk: { rps: 5, burst: 10 },
  typeform: { rps: 5, burst: 10 },
  'google-drive': { rps: 10, burst: 20 },
  'google-calendar': { rps: 10, burst: 20 },
  dropbox: { rps: 10, burst: 20 }
};

class RateLimiter {
  private buckets = new Map<string, Bucket>();

  private getBucket(key: string): Bucket {
    const cfg = DEFAULTS[key] || { rps: 5, burst: 10 };
    let b = this.buckets.get(key);
    if (!b) {
      b = {
        capacity: cfg.burst,
        tokens: cfg.burst,
        refillRatePerSec: cfg.rps,
        lastRefill: Date.now()
      };
      this.buckets.set(key, b);
    }
    return b;
  }

  private refill(b: Bucket) {
    const now = Date.now();
    const elapsed = (now - b.lastRefill) / 1000;
    const refill = elapsed * b.refillRatePerSec;
    if (refill > 0) {
      b.tokens = Math.min(b.capacity, b.tokens + refill);
      b.lastRefill = now;
    }
  }

  public async acquire(key: string): Promise<void> {
    const bucket = this.getBucket(key);
    while (true) {
      this.refill(bucket);
      if (bucket.tokens >= 1) {
        bucket.tokens -= 1;
        return;
      }
      // Wait until a token becomes available
      const waitMs = Math.max(50, Math.ceil(1000 / (bucket.refillRatePerSec || 1)));
      await new Promise(r => setTimeout(r, waitMs));
    }
  }
}

export const rateLimiter = new RateLimiter();

