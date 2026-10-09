/**
 * @file src/views/fromtop.ts
 * @desc /pool fromtop's draft: a tournament-shaped pool from a player's top plays. TB takes the
 *       highest-pp play; then NM, HD, HR, DT and FM (mixed mods) fill from their own plays by pp,
 *       each map once. A bucket without enough plays stays short (no borrowing). Pure.
 * @author David @dvhsh (https://dvh.sh)
 * @created Thu Oct 8, 2026
 * @modified Thu Oct 8, 2026
 */

import { bucketOf } from "./practice.ts";

/** The draft sizes. */
export const FROMTOP_SIZES = ["small", "medium", "large"] as const;
export type FromtopSize = (typeof FROMTOP_SIZES)[number];

/** The slot groups, in pool order. */
const MODS = ["NM", "HD", "HR", "DT", "FM", "TB"] as const;
type DraftMod = (typeof MODS)[number];

/** Maps per slot group for each size (14, 18 and 22 maps). */
export const FROMTOP_SHARES: Readonly<Record<FromtopSize, Readonly<Record<DraftMod, number>>>> = {
  small: { NM: 4, HD: 2, HR: 2, DT: 2, FM: 3, TB: 1 },
  medium: { NM: 5, HD: 3, HR: 3, DT: 3, FM: 3, TB: 1 },
  large: { NM: 6, HD: 4, HR: 4, DT: 4, FM: 3, TB: 1 },
};

/** A top play as the draft reads it. */
export type FromtopPlay = { beatmapId: number; mods: string[]; pp: number };

/** One drafted slot. */
export type DraftSlot = { label: string; mod: DraftMod; index: number; beatmapId: number };

/**
 * @function draftFromTop
 * @param top {readonly FromtopPlay[]} the player's top plays, any order
 * @param size {FromtopSize} how big a pool
 * @returns {DraftSlot[]} the slots in pool order (NM HD HR DT FM TB), each map once
 */
export const draftFromTop = (top: readonly FromtopPlay[], size: FromtopSize): DraftSlot[] => {
  const shares = FROMTOP_SHARES[size];
  const byPp = [...top].sort((a, b) => b.pp - a.pp || a.beatmapId - b.beatmapId);
  const used = new Set<number>();
  const picked = new Map<DraftMod, number[]>(MODS.map((mod) => [mod, []]));
  const tb = byPp[0];
  if (tb) {
    used.add(tb.beatmapId);
    picked.get("TB")?.push(tb.beatmapId);
  }
  for (const play of byPp) {
    if (used.has(play.beatmapId)) continue;
    const mod = bucketOf(play.mods);
    const list = picked.get(mod) as number[];
    if (list.length >= shares[mod]) continue;
    used.add(play.beatmapId);
    list.push(play.beatmapId);
  }
  return MODS.flatMap((mod) =>
    (picked.get(mod) ?? []).map((beatmapId, i) => ({
      label: mod === "TB" ? "TB" : `${mod}${i + 1}`,
      mod,
      index: i + 1,
      beatmapId,
    })),
  );
};

/**
 * @function shortBuckets
 * @param slots {readonly DraftSlot[]} a draft
 * @param size {FromtopSize} the size asked for
 * @returns {{ mod: DraftMod; short: number }[]} each group with fewer maps than its share
 */
export const shortBuckets = (
  slots: readonly DraftSlot[],
  size: FromtopSize,
): { mod: DraftMod; short: number }[] =>
  MODS.map((mod) => ({
    mod,
    short: FROMTOP_SHARES[size][mod] - slots.filter((slot) => slot.mod === mod).length,
  })).filter(({ short }) => short > 0);
