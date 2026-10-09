/**
 * @file tests/views/fromtop.test.ts
 * @desc /pool fromtop's draft: the agreed shares, TB first, each map once, short buckets short.
 * @author David @dvhsh (https://dvh.sh)
 * @created Thu Oct 8, 2026
 * @modified Thu Oct 8, 2026
 */

import { describe, expect, it } from "vitest";
import { draftFromTop, FROMTOP_SHARES, shortBuckets } from "../../src/views/fromtop.ts";

describe("draftFromTop", () => {
  it("has the agreed shares", () => {
    expect(FROMTOP_SHARES.small).toEqual({ NM: 4, HD: 2, HR: 2, DT: 2, FM: 3, TB: 1 });
    expect(FROMTOP_SHARES.medium).toEqual({ NM: 5, HD: 3, HR: 3, DT: 3, FM: 3, TB: 1 });
    expect(FROMTOP_SHARES.large).toEqual({ NM: 6, HD: 4, HR: 4, DT: 4, FM: 3, TB: 1 });
    expect(Object.values(FROMTOP_SHARES.small).reduce((a, b) => a + b)).toBe(14);
    expect(Object.values(FROMTOP_SHARES.large).reduce((a, b) => a + b)).toBe(22);
  });

  it("takes TB first, never repeats a map, leaves short buckets short", () => {
    const top = [
      { beatmapId: 1, mods: ["HD"], pp: 900 },
      { beatmapId: 1, mods: [], pp: 800 },
      { beatmapId: 2, mods: [], pp: 700 },
      { beatmapId: 3, mods: ["HR"], pp: 600 },
    ];
    const out = draftFromTop(top, "small");
    expect(out.find((s) => s.mod === "TB")?.beatmapId).toBe(1);
    expect(new Set(out.map((s) => s.beatmapId)).size).toBe(out.length);
    expect(out.map((s) => s.label)).toEqual(["NM1", "HR1", "TB"]);
    expect(shortBuckets(out, "small")).toEqual([
      { mod: "NM", short: 3 },
      { mod: "HD", short: 2 },
      { mod: "HR", short: 1 },
      { mod: "DT", short: 2 },
      { mod: "FM", short: 3 },
    ]);
  });

  it("fills by pp, puts mixed mods in FM, and numbers slots", () => {
    const top = [
      { beatmapId: 10, mods: ["DT"], pp: 500 },
      { beatmapId: 11, mods: ["HD", "DT"], pp: 450 },
      { beatmapId: 12, mods: ["NC"], pp: 480 },
      { beatmapId: 13, mods: ["DT"], pp: 470 },
    ];
    const out = draftFromTop(top, "small");
    expect(out.map((s) => [s.label, s.beatmapId, s.index])).toEqual([
      ["DT1", 12, 1],
      ["DT2", 13, 2],
      ["FM1", 11, 1],
      ["TB", 10, 1],
    ]);
  });
});
