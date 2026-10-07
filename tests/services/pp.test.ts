/**
 * @file tests/services/pp.test.ts
 * @desc rosu wrappers against a hand-written .osu file: attributes with mods, pp by accuracy,
 *       a score's pp and full-combo pp per ruleset mapping, accuracy formulas, /simulate.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { describe, expect, it } from "vitest";
import {
  accuracyOf,
  fullComboArgs,
  mapAttributes,
  ppAtAccuracies,
  scoreArgs,
  scorePp,
  simulate,
} from "../../src/services/pp.ts";
import { FIXTURE_OSU, makeScore } from "../helpers.ts";

describe("pp", () => {
  it("reads attributes and applies mods", () => {
    const plain = mapAttributes(FIXTURE_OSU, []);
    const dt = mapAttributes(FIXTURE_OSU, [{ acronym: "DT" }]);
    expect(plain).toMatchObject({ cs: 4, ar: 9, od: 8, hp: 5, clockRate: 1 });
    expect(plain.maxCombo).toBeGreaterThan(100);
    expect(dt.stars).toBeGreaterThan(plain.stars);
    expect(dt.clockRate).toBe(1.5);
    expect(mapAttributes(FIXTURE_OSU, [], "taiko").stars).not.toBe(plain.stars);
  });

  it("gives more pp for more accuracy", () => {
    const [low, high] = ppAtAccuracies(FIXTURE_OSU, [], [95, 100]);
    expect(low?.accuracy).toBe(95);
    expect((high?.pp ?? 0) > (low?.pp ?? 0)).toBe(true);
  });

  it("recalculates a score and its full combo", () => {
    const score = makeScore({ statistics: { great: 110, ok: 5, miss: 5 }, maxCombo: 40 });
    const result = scorePp(FIXTURE_OSU, score);
    expect(result.fcPp).toBeGreaterThan(result.pp);
    expect(result.fcAccuracy).toBeGreaterThan(score.accuracy * 100 - 5);
  });

  it("maps each ruleset's judgements", () => {
    expect(
      scoreArgs(makeScore({ ruleset: "taiko", statistics: { great: 3, ok: 2, miss: 1 } })),
    ).toMatchObject({ n300: 3, n100: 2, misses: 1 });
    expect(
      scoreArgs(
        makeScore({
          ruleset: "fruits",
          statistics: {
            great: 3,
            large_tick_hit: 2,
            small_tick_hit: 4,
            small_tick_miss: 1,
            miss: 1,
            large_tick_miss: 1,
          },
        }),
      ),
    ).toMatchObject({ n300: 3, n100: 2, n50: 4, nKatu: 1, misses: 2 });
    expect(
      scoreArgs(
        makeScore({
          ruleset: "mania",
          statistics: { perfect: 9, great: 1, good: 2, ok: 3, meh: 4, miss: 5 },
        }),
      ),
    ).toMatchObject({ nGeki: 9, n300: 1, nKatu: 2, n100: 3, n50: 4, misses: 5 });
    expect(scoreArgs(makeScore({ legacyTotalScore: 5 })).lazer).toBe(false);
    expect(
      fullComboArgs(makeScore({ ruleset: "mania", statistics: { perfect: 9, miss: 2 } })),
    ).toMatchObject({ nGeki: 11, misses: 0 });
    expect(
      fullComboArgs(
        makeScore({
          ruleset: "fruits",
          statistics: { great: 3, miss: 1, large_tick_hit: 1, large_tick_miss: 2 },
        }),
      ),
    ).toMatchObject({ n300: 4, n100: 3 });
    expect(
      fullComboArgs(makeScore({ maximumStatistics: { large_tick_hit: 7, slider_tail_hit: 9 } })),
    ).toMatchObject({ largeTickHits: 7, sliderEndHits: 9, n300: 111 });
    expect(
      fullComboArgs(makeScore({ ruleset: "taiko", statistics: { great: 3, miss: 1 } })),
    ).toMatchObject({ n300: 4, misses: 0 });
  });

  it("computes accuracy per ruleset", () => {
    expect(accuracyOf({ n300: 1 }, "osu")).toBe(100);
    expect(accuracyOf({ n300: 1, n100: 1 }, "taiko")).toBe(75);
    expect(accuracyOf({ n300: 1, misses: 1 }, "fruits")).toBe(50);
    expect(accuracyOf({ nGeki: 1, misses: 1 }, "mania")).toBe(50);
    expect(accuracyOf({}, "osu")).toBe(100);
  });

  it("simulates", () => {
    const fc = simulate(FIXTURE_OSU, { mods: [] });
    const worse = simulate(FIXTURE_OSU, { mods: [], accuracy: 95, misses: 3, combo: 50 });
    expect(worse.pp).toBeLessThan(fc.pp);
    expect(worse.maxCombo).toBe(fc.maxCombo);
  });
});
