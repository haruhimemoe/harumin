/**
 * @file src/views/session.ts
 * @desc /recent's session line from the 24 h recent list: how many times the map was tried,
 *       and whether the shown play was the first pass, the best try, or which older try beat
 *       it. Passes rank above fails, then total score, the way osu! ranks them.
 * @author David @dvhsh (https://dvh.sh)
 * @created Thu Oct 8, 2026
 * @modified Thu Oct 8, 2026
 */

/** One attempt as the session needs it. Accuracy is a percent (0 to 100). */
export type SessionScore = {
  beatmapId: number;
  passed: boolean;
  accuracy: number;
  totalScore: number;
};

/** The session line on the card. */
export type Session = { today: number; note: string | null };

const plural = (n: number, word: "fail" | "try") =>
  `${n} ${n === 1 ? word : word === "try" ? "tries" : "fails"}`;

/** Whether a beats b: a pass beats a fail, then the higher total score. */
const beats = (a: SessionScore, b: SessionScore) =>
  a.passed !== b.passed ? a.passed : a.totalScore > b.totalScore;

/**
 * @function sessionOf
 * @param scores {readonly SessionScore[]} the recent list, newest first, fails included
 * @param index {number} the shown play's place in the list
 * @returns {Session} attempts on the map in the list, and the note (null when there's nothing to say)
 */
export const sessionOf = (scores: readonly SessionScore[], index: number): Session => {
  const shown = scores[index];
  if (!shown) return { today: 1, note: null };
  const same = scores
    .map((score, at) => ({ score, at }))
    .filter(({ score }) => score.beatmapId === shown.beatmapId);
  const today = same.length;
  if (today < 2) return { today, note: null };
  const older = same.filter(({ at }) => at > index);
  if (shown.passed && older.length > 0 && older.every(({ score }) => !score.passed)) {
    return { today, note: `first pass after ${plural(older.length, "fail")}` };
  }
  const best = same.reduce((top, next) => (beats(next.score, top.score) ? next : top));
  if (best.at === index || !beats(best.score, shown)) return { today, note: `best of ${today}` };
  // The list is newest first: a better try at a lower index came after the shown one.
  if (best.at < index) return { today, note: null };
  return {
    today,
    note: `best was ${best.score.accuracy.toFixed(2)}%, ${plural(best.at - index, "try")} ago`,
  };
};
