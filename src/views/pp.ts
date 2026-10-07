/**
 * @file src/views/pp.ts
 * @desc pp that needs the .osu file, best effort: when osu! won't give the file or rosu can't
 *       read it, cards show what the API sent and leave the extra numbers out.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import type { Ruleset } from "@haruhimemoe/harumin-config";
import type { OsuMod, OsuScore } from "@haruhimemoe/osu";
import {
  type AccuracyPp,
  type MapAttributes,
  mapAttributes,
  ppAtAccuracies,
  type ScorePp,
  scorePp,
} from "../services/pp.ts";
import type { Services } from "../types.ts";

/** The accuracies a map card shows pp for. */
export const CARD_ACCURACIES = [95, 98, 99, 100] as const;

/**
 * @function tryScorePp
 * @param s {Pick<Services, "beatmaps">} the .osu cache
 * @param score {OsuScore} a score with its beatmap
 * @returns {Promise<ScorePp | null>} rosu's numbers, or null
 */
export const tryScorePp = async (
  s: Pick<Services, "beatmaps">,
  score: OsuScore,
): Promise<ScorePp | null> => {
  try {
    const bytes = await s.beatmaps.get(score.beatmapId, score.beatmap?.checksum ?? null);
    return bytes ? scorePp(bytes, score) : null;
  } catch {
    return null;
  }
};

/**
 * @function tryMapPp
 * @param s {Pick<Services, "beatmaps">} the .osu cache
 * @param beatmapId {number} the difficulty
 * @param checksum {string | null} its MD5
 * @param mods {readonly OsuMod[]} mods
 * @param ruleset {Ruleset | undefined} a convert's ruleset
 * @returns {Promise<{ attrs: MapAttributes; pps: AccuracyPp[] } | null>} or null
 */
export const tryMapPp = async (
  s: Pick<Services, "beatmaps">,
  beatmapId: number,
  checksum: string | null,
  mods: readonly OsuMod[],
  ruleset?: Ruleset,
): Promise<{ attrs: MapAttributes; pps: AccuracyPp[] } | null> => {
  try {
    const bytes = await s.beatmaps.get(beatmapId, checksum);
    if (!bytes) return null;
    return {
      attrs: mapAttributes(bytes, mods, ruleset),
      pps: ppAtAccuracies(bytes, mods, CARD_ACCURACIES, ruleset),
    };
  } catch {
    return null;
  }
};
