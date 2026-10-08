/**
 * @file src/views/best.ts
 * @desc A player's best score on a map (pp first, then total score, the way /score ranks
 *       them), and the favorite line /osu draws from it: "Artist - Title [Diff]", pp and mods.
 *       The line is cached an hour per player, map and ruleset; any failure is null, so /osu
 *       just leaves the line off.
 * @author David @dvhsh (https://dvh.sh)
 * @created Thu Oct 8, 2026
 * @modified Thu Oct 8, 2026
 */

import type { Ruleset } from "@haruhimemoe/harumin-config";
import type { OsuScore } from "@haruhimemoe/osu";
import { createTtlCache } from "../services/cache.ts";
import type { Services } from "../types.ts";

/** The favorite line's data, as the profile card's theme takes it. */
export type FavoriteLine = { title: string; pp: number | null; mods: string[] };

const lines = createTtlCache<string, FavoriteLine | null>(60 * 60_000, 5_000);

/**
 * @function bestOf
 * @param scores {readonly OsuScore[]} scores on one map
 * @returns {OsuScore | null} the highest pp, then the highest total score; null when empty
 */
export const bestOf = (scores: readonly OsuScore[]): OsuScore | null =>
  [...scores].sort((a, b) => (b.pp ?? 0) - (a.pp ?? 0) || b.totalScore - a.totalScore)[0] ?? null;

/**
 * @function favoriteLine
 * @param s {Pick<Services, "osu">} osu!
 * @param osuId {number} the player
 * @param beatmapId {number} their favorite difficulty
 * @param ruleset {Ruleset} the card's ruleset (a convert's scores when it isn't the map's own)
 * @returns {Promise<FavoriteLine | null>} the line, or null with no score or on any error
 */
export const favoriteLine = async (
  s: Pick<Services, "osu">,
  osuId: number,
  beatmapId: number,
  ruleset: Ruleset,
): Promise<FavoriteLine | null> => {
  const key = `${osuId}:${beatmapId}:${ruleset}`;
  const hit = lines.get(key);
  if (hit !== undefined) return hit;
  try {
    const best = bestOf(await s.osu.getBeatmapUserScores(beatmapId, osuId, { ruleset }));
    let line: FavoriteLine | null = null;
    if (best) {
      const named =
        best.beatmap && best.beatmapset
          ? { ...best.beatmapset, version: best.beatmap.version }
          : await s.osu.getBeatmap(beatmapId);
      line = named
        ? {
            title: `${named.artist} - ${named.title} [${named.version}]`.slice(0, 200),
            pp: best.pp,
            mods: best.mods.map((mod) => mod.acronym),
          }
        : null;
    }
    lines.set(key, line);
    return line;
  } catch {
    return null;
  }
};
