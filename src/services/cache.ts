/**
 * @file src/services/cache.ts
 * @desc A small in-memory cache with a TTL and a size cap (oldest entry out first). Used for
 *       links, settings and score pages.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

/** The cache. */
export type TtlCache<K, V> = {
  get: (key: K) => V | undefined;
  set: (key: K, value: V) => void;
  delete: (key: K) => void;
  size: () => number;
};

/**
 * @function createTtlCache
 * @param ttlMs {number} how long an entry lives
 * @param maxSize {number} the most entries kept
 * @param now {() => number} clock (tests)
 * @returns {TtlCache<K, V>} an empty cache
 */
export const createTtlCache = <K, V>(
  ttlMs: number,
  maxSize = 10_000,
  now: () => number = Date.now,
): TtlCache<K, V> => {
  const entries = new Map<K, { value: V; expires: number }>();
  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expires <= now()) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key, value) {
      entries.delete(key);
      entries.set(key, { value, expires: now() + ttlMs });
      while (entries.size > maxSize) {
        const oldest = entries.keys().next().value as K;
        entries.delete(oldest);
      }
    },
    delete: (key) => {
      entries.delete(key);
    },
    size: () => entries.size,
  };
};
