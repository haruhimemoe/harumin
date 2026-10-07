/**
 * @file src/services/context.ts
 * @desc What each channel last talked about: the last beatmap, match, pack and pool someone
 *       linked or a command showed. Commands fall back to it when the option is left empty, so
 *       "/score" after a map link means that map. In memory only, gone after half an hour or a
 *       restart, last one wins per kind.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { CONTEXT_TTL_MS } from "../constants.ts";
import { createTtlCache } from "./cache.ts";

/** One remembered thing. */
export type ContextRef =
  | { key: "map"; beatmapId: number }
  | { key: "match"; matchId: number }
  | { key: "pack"; slug: string }
  | { key: "pool"; poolId: string };

/** The kinds a channel remembers. */
export type ContextKey = ContextRef["key"];

/** The per-channel memory. */
export type ChannelContext = {
  set: (channelId: string, ref: ContextRef) => void;
  get: <K extends ContextKey>(channelId: string, key: K) => Extract<ContextRef, { key: K }> | null;
};

/**
 * @function createChannelContext
 * @param now {() => number} clock (tests)
 * @returns {ChannelContext} an empty memory
 */
export const createChannelContext = (now: () => number = Date.now): ChannelContext => {
  const cache = createTtlCache<string, ContextRef>(CONTEXT_TTL_MS, 50_000, now);
  return {
    set: (channelId, ref) => cache.set(`${channelId}:${ref.key}`, ref),
    get: (channelId, key) =>
      (cache.get(`${channelId}:${key}`) as Extract<ContextRef, { key: typeof key }> | undefined) ??
      null,
  };
};
