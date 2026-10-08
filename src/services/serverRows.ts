/**
 * @file src/services/serverRows.ts
 * @desc The linked members /server last listed per server (name and rank), so the `name`
 *       option's autocomplete can offer them without calling osu!. Ten minutes, in memory.
 * @author David @dvhsh (https://dvh.sh)
 * @created Thu Oct 8, 2026
 * @modified Thu Oct 8, 2026
 */

import { createTtlCache } from "./cache.ts";

/** One linked member. */
export type ServerRow = { username: string; rank: number | null };

/** The per-server rows. */
export type ServerRows = {
  set: (guildId: string, rows: ServerRow[]) => void;
  get: (guildId: string) => ServerRow[];
};

/**
 * @function createServerRows
 * @param now {() => number} clock (tests)
 * @returns {ServerRows} an empty memory
 */
export const createServerRows = (now: () => number = Date.now): ServerRows => {
  const cache = createTtlCache<string, ServerRow[]>(10 * 60_000, 5_000, now);
  return {
    set: (guildId, rows) => cache.set(guildId, rows),
    get: (guildId) => cache.get(guildId) ?? [],
  };
};
