/**
 * @file src/services/context.ts
 * @desc What each channel last talked about: the last beatmap, match, pack and pool someone
 *       linked or a command showed. Commands fall back to it when the option is left empty, so
 *       "/score" after a map link means that map. In memory only, gone after half an hour or a
 *       restart, last one wins per kind. Maps also keep a short history per channel (the last 10,
 *       newest first) with their "Artist - Title [Diff] · 6.21★" labels, for /map's autocomplete.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Thu Oct 8, 2026
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

/** One map in a channel's history. */
export type RecentMap = { beatmapId: number; label: string };

/** How many maps a channel's history keeps. */
export const RECENT_MAPS = 10;

/** The per-channel memory. */
export type ChannelContext = {
  set: (channelId: string, ref: ContextRef) => void;
  get: <K extends ContextKey>(channelId: string, key: K) => Extract<ContextRef, { key: K }> | null;
  /** Sets the channel's map and puts it first in its history. */
  rememberMap: (channelId: string, beatmapId: number) => void;
  /** The channel's maps, newest first, at most RECENT_MAPS. */
  recentMaps: (channelId: string) => RecentMap[];
  /** Notes a map's label, for any channel that shows it. */
  nameMap: (beatmapId: number, label: string) => void;
};

/**
 * @function createChannelContext
 * @param now {() => number} clock (tests)
 * @returns {ChannelContext} an empty memory
 */
export const createChannelContext = (now: () => number = Date.now): ChannelContext => {
  const cache = createTtlCache<string, ContextRef>(CONTEXT_TTL_MS, 50_000, now);
  const history = createTtlCache<string, number[]>(CONTEXT_TTL_MS, 50_000, now);
  const labels = createTtlCache<number, string>(24 * 60 * 60_000, 20_000, now);
  const set = (channelId: string, ref: ContextRef) => cache.set(`${channelId}:${ref.key}`, ref);
  return {
    set,
    get: (channelId, key) =>
      (cache.get(`${channelId}:${key}`) as Extract<ContextRef, { key: typeof key }> | undefined) ??
      null,
    rememberMap(channelId, beatmapId) {
      set(channelId, { key: "map", beatmapId });
      const ids = (history.get(channelId) ?? []).filter((id) => id !== beatmapId);
      history.set(channelId, [beatmapId, ...ids].slice(0, RECENT_MAPS));
    },
    recentMaps: (channelId) =>
      (history.get(channelId) ?? []).map((beatmapId) => ({
        beatmapId,
        label: labels.get(beatmapId) ?? `Beatmap #${beatmapId}`,
      })),
    nameMap: (beatmapId, label) => labels.set(beatmapId, label),
  };
};
