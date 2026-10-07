/**
 * @file src/utils/scores.ts
 * @desc Sorting, filtering and paging score lists for /top, /score and /leaderboard. Each entry
 *       keeps its place in the original list (a top play stays "#7" however it's sorted).
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import type { OsuMod, OsuScore } from "@haruhimemoe/osu";
import { PAGE_SIZE } from "../constants.ts";
import { matchesMods } from "./mods.ts";

/** How /top sorts. */
export const TOP_SORTS = ["pp", "recent", "accuracy", "combo", "score", "misses"] as const;
/** One of TOP_SORTS. */
export type TopSort = (typeof TOP_SORTS)[number];

/** A score with its place in the original list. */
export type Placed = { score: OsuScore; place: number };

const misses = (score: OsuScore) => score.statistics.miss ?? 0;

const COMPARE: Readonly<Record<TopSort, (a: OsuScore, b: OsuScore) => number>> = Object.freeze({
  pp: (a, b) => (b.pp ?? 0) - (a.pp ?? 0),
  recent: (a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt),
  accuracy: (a, b) => b.accuracy - a.accuracy,
  combo: (a, b) => b.maxCombo - a.maxCombo,
  score: (a, b) => b.totalScore - a.totalScore,
  misses: (a, b) => misses(a) - misses(b),
});

/**
 * @function arrangeScores
 * @param scores {readonly OsuScore[]} the list in osu!'s order
 * @param options {{ sort?: TopSort; mods?: readonly OsuMod[] | null; reverse?: boolean }}
 * @returns {Placed[]} filtered by mods, sorted (stable, ties keep osu!'s order), maybe reversed
 */
export const arrangeScores = (
  scores: readonly OsuScore[],
  {
    sort = "pp",
    mods = null,
    reverse = false,
  }: { sort?: TopSort; mods?: readonly OsuMod[] | null; reverse?: boolean } = {},
): Placed[] => {
  const placed = scores
    .map((score, i) => ({ score, place: i + 1 }))
    .filter(({ score }) => mods === null || matchesMods(score.mods, mods));
  placed.sort((a, b) => COMPARE[sort](a.score, b.score) || a.place - b.place);
  return reverse ? placed.reverse() : placed;
};

/**
 * @function pageOf
 * @param items {readonly T[]} everything
 * @param page {number} 1-based (clamped)
 * @param size {number} per page
 * @returns {{ items: T[]; page: number; pages: number }} one page
 */
export const pageOf = <T>(
  items: readonly T[],
  page: number,
  size = PAGE_SIZE,
): { items: T[]; page: number; pages: number } => {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const at = Math.min(Math.max(1, Math.trunc(page) || 1), pages);
  return { items: items.slice((at - 1) * size, at * size), page: at, pages };
};
