/**
 * @file src/views/poolMe.ts
 * @desc /pool me: the player's best score on each of a pool's maps (4 osu! calls at once, each
 *       waiting on the shared budget), as a slot's `mine` (grade, accuracy as a percent, pp), and
 *       the footer's summary. A map whose call fails or has no score is null; a call refused by
 *       the budget is null too, and noted so the footer can say osu! was busy.
 * @author David @dvhsh (https://dvh.sh)
 * @created Fri Oct 9, 2026
 * @modified Fri Oct 9, 2026
 */

import type { PoolCard, Ruleset } from "@haruhimemoe/harumin-config";
import { OsuApiError, type OsuScore } from "@haruhimemoe/osu";
import type { Services } from "../types.ts";
import { mapLimit } from "../utils/async.ts";
import { bestOf } from "./best.ts";

/** A player's score on one slot, as the pool card draws it. */
export type Mine = NonNullable<PoolCard["slots"][number]["mine"]>;

/** osu! calls at once. */
const AT_ONCE = 4;

/**
 * @function mineOf
 * @param score {OsuScore} a score
 * @returns {Mine} its grade, accuracy as a percent (osu! sends 0 to 1) and pp
 */
export const mineOf = (score: OsuScore): Mine => ({
  grade: score.rank,
  accuracy: Math.min(100, Math.max(0, score.accuracy * 100)),
  pp: score.pp,
});

/**
 * @function summarizeMine
 * @param slots {readonly { mine: { accuracy: number } | null | undefined }[]} the card's slots
 * @returns {string} "played 14 of 18 · avg 97.40%" (the average over played maps only)
 */
export const summarizeMine = (
  slots: readonly { mine?: { accuracy: number } | null | undefined }[],
): string => {
  const played = slots.flatMap((slot) => (slot.mine ? [slot.mine.accuracy] : []));
  const head = `played ${played.length} of ${slots.length}`;
  if (!played.length) return head;
  const avg = played.reduce((sum, n) => sum + n, 0) / played.length;
  return `${head} · avg ${avg.toFixed(2)}%`;
};

/**
 * @function loadMine
 * @param s {Pick<Services, "osu">} osu!
 * @param osuId {number} the player
 * @param beatmapIds {readonly number[]} the pool's maps
 * @param ruleset {Ruleset} the player's ruleset
 * @returns {Promise<{ mine: Map<number, Mine | null>; busy: boolean }>} the best score per map
 *          (null when none or on any error), and whether the budget refused a call
 */
export const loadMine = async (
  s: Pick<Services, "osu">,
  osuId: number,
  beatmapIds: readonly number[],
  ruleset: Ruleset,
): Promise<{ mine: Map<number, Mine | null>; busy: boolean }> => {
  let busy = false;
  const found = await mapLimit(beatmapIds, AT_ONCE, async (beatmapId) => {
    try {
      const best = bestOf(await s.osu.getBeatmapUserScores(beatmapId, osuId, { ruleset }));
      return best ? mineOf(best) : null;
    } catch (error) {
      if (error instanceof OsuApiError && error.code === "budget") busy = true;
      return null;
    }
  });
  return { mine: new Map(beatmapIds.map((id, i) => [id, found[i] ?? null])), busy };
};
