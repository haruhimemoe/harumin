/**
 * @file src/services/lookups.ts
 * @desc The osu! names each Discord user looked up lately, for the `name` option's
 *       autocomplete: 20 per user, newest first, a day, in memory only.
 * @author David @dvhsh (https://dvh.sh)
 * @created Thu Oct 8, 2026
 * @modified Thu Oct 8, 2026
 */

import { createTtlCache } from "./cache.ts";

/** How many names each user keeps. */
export const RECENT_NAMES = 20;

/** The per-user name memory. */
export type Lookups = {
  note: (discordId: string, username: string) => void;
  recent: (discordId: string) => string[];
};

/**
 * @function createLookups
 * @param now {() => number} clock (tests)
 * @returns {Lookups} an empty memory
 */
export const createLookups = (now: () => number = Date.now): Lookups => {
  const cache = createTtlCache<string, string[]>(24 * 60 * 60_000, 20_000, now);
  return {
    note(discordId, username) {
      const lower = username.toLowerCase();
      const names = (cache.get(discordId) ?? []).filter((name) => name.toLowerCase() !== lower);
      cache.set(discordId, [username, ...names].slice(0, RECENT_NAMES));
    },
    recent: (discordId) => cache.get(discordId) ?? [],
  };
};
