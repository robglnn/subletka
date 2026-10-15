import "server-only";

export const limiter = (maxKeys = 10_000) => {
  const buckets = new Map<string, number[]>();
  let longest = 0;
  const sweep = (now: number) => {
    for (const [key, hits] of buckets) {
      if (now - hits[hits.length - 1] < longest) break;
      buckets.delete(key);
    }
  };
  const take = (key: string, limit: number, windowMs: number): number => {
    const now = Date.now();
    longest = Math.max(longest, windowMs);
    sweep(now);
    const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
    if (hits.length >= limit) {
      buckets.set(key, hits);
      return hits[hits.length - limit] + windowMs - now;
    }
    hits.push(now);
    buckets.delete(key);
    buckets.set(key, hits);
    if (buckets.size > maxKeys) buckets.delete(buckets.keys().next().value!);
    return 0;
  };
  return Object.assign(take, { size: () => buckets.size });
};

const take = limiter();

export const allow = (key: string, limit: number, windowMs: number) => take(key, limit, windowMs) === 0;
