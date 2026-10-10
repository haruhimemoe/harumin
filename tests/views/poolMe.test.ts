/**
 * @file tests/views/poolMe.test.ts
 * @desc /pool me: the played summary, a score as a slot's `mine`, and the scores per slot
 *       (a failing map is null, a busy osu! is noted).
 * @author David @dvhsh (https://dvh.sh)
 * @created Fri Oct 9, 2026
 * @modified Fri Oct 9, 2026
 */

import { OsuApiError, type OsuScore } from "@haruhimemoe/osu";
import { describe, expect, it } from "vitest";
import { loadMine, mineOf, summarizeMine } from "../../src/views/poolMe.ts";

const score = (over: Partial<OsuScore>): OsuScore =>
  ({ rank: "S", accuracy: 0.9876, pp: 300, totalScore: 1, ...over }) as OsuScore;

describe("summarizeMine", () => {
  it("counts the played and averages their accuracy", () => {
    expect(
      summarizeMine([{ mine: { accuracy: 98 } }, { mine: { accuracy: 96.8 } }, { mine: null }]),
    ).toBe("played 2 of 3 · avg 97.40%");
  });
  it("leaves the average off with nothing played", () => {
    expect(summarizeMine([{ mine: null }, { mine: undefined }])).toBe("played 0 of 2");
  });
});

describe("mineOf", () => {
  it("turns osu!'s 0 to 1 accuracy into a percent", () => {
    expect(mineOf(score({ rank: "X", accuracy: 1, pp: null }))).toEqual({
      grade: "X",
      accuracy: 100,
      pp: null,
    });
  });
});

describe("loadMine", () => {
  it("keeps the best score per map; a failing or empty map is null", async () => {
    const osu = {
      getBeatmapUserScores: async (beatmapId: number) => {
        if (beatmapId === 2) throw new Error("404");
        if (beatmapId === 3) return [];
        return [score({ pp: 100, rank: "A" }), score({ pp: 250, rank: "S" })];
      },
    };
    const out = await loadMine({ osu } as never, 7, [1, 2, 3], "osu");
    expect(out.busy).toBe(false);
    expect(out.mine.get(1)).toMatchObject({ grade: "S", pp: 250 });
    expect(out.mine.get(2)).toBeNull();
    expect(out.mine.get(3)).toBeNull();
  });
  it("notes a busy osu!", async () => {
    const osu = {
      getBeatmapUserScores: async () => {
        throw new OsuApiError("budget", "x");
      },
    };
    const out = await loadMine({ osu } as never, 7, [1], "osu");
    expect(out).toEqual({ mine: new Map([[1, null]]), busy: true });
  });
});
