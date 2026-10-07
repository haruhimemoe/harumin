/**
 * @file src/utils/async.ts
 * @desc mapLimit: run async work over a list with at most N at once, results in input order.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

/**
 * @function mapLimit
 * @param items {readonly T[]} inputs
 * @param limit {number} at most this many at once
 * @param run {(item: T) => Promise<R>} the work
 * @returns {Promise<R[]>} results in input order; the first rejection rejects the whole call
 */
export const mapLimit = async <T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await run(items[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
  return results;
};
