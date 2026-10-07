/**
 * @file tests/utils/utils.test.ts
 * @desc Formatting, mods input and filters, score arranging and paging, redaction, mapLimit.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { describe, expect, it } from "vitest";
import { mapLimit } from "../../src/utils/async.ts";
import {
  completion,
  discordTime,
  escapeMarkdown,
  flag,
  formatHits,
  formatInt,
  formatPlayTime,
  formatPp,
  truncate,
} from "../../src/utils/format.ts";
import { matchesMods, parseModsInput } from "../../src/utils/mods.ts";
import { redact } from "../../src/utils/redact.ts";
import { arrangeScores, pageOf } from "../../src/utils/scores.ts";
import { makeScore } from "../helpers.ts";

describe("format", () => {
  it("formats numbers, pp, time and flags", () => {
    expect(formatInt(1234567)).toBe("1,234,567");
    expect(formatPp(312.456)).toBe("312.46pp");
    expect(formatPp(null)).toBe("no pp");
    expect(formatPlayTime(3600 * 321 + 720)).toBe("321h 12m");
    expect(flag("au")).toBe("🇦🇺");
    expect(flag(null)).toBe("");
    expect(flag("AUS")).toBe("");
    expect(discordTime("2026-10-06T00:00:00Z", "D")).toBe("<t:1791244800:D>");
    expect(escapeMarkdown("a_b*c")).toBe("a\\_b\\*c");
    expect(truncate("abcdef", 4)).toBe("abc…");
    expect(truncate("abc", 4)).toBe("abc");
  });

  it("formats hits per ruleset", () => {
    expect(formatHits({ great: 300, ok: 4, miss: 1 }, "osu")).toBe("[300/4/0/1]");
    expect(formatHits({ perfect: 9, great: 1 }, "mania")).toBe("[9/1/0/0/0/0]");
    expect(formatHits({}, "taiko")).toBe("[0/0/0]");
    expect(formatHits({ great: 5 }, "fruits")).toBe("[5/0/0/0/0]");
  });

  it("works out fail completion", () => {
    expect(
      completion({ statistics: { great: 50, miss: 10 }, maximumStatistics: { great: 120 } }),
    ).toBe(50);
    expect(completion({ statistics: {}, maximumStatistics: null })).toBeNull();
    expect(completion({ statistics: {}, maximumStatistics: { large_tick_hit: 3 } })).toBeNull();
  });
});

describe("mods", () => {
  it("parses typed mods", () => {
    expect(parseModsInput("hddt")?.map((m) => m.acronym)).toEqual(["HD", "DT"]);
    expect(parseModsInput("+HD, HR")?.map((m) => m.acronym)).toEqual(["HD", "HR"]);
    expect(parseModsInput("HDHD")?.map((m) => m.acronym)).toEqual(["HD"]);
    expect(parseModsInput("SV2HD")?.map((m) => m.acronym)).toEqual(["SV2", "HD"]);
    expect(parseModsInput("NM")).toEqual([]);
    expect(parseModsInput("")).toEqual([]);
    expect(parseModsInput("XX")).toBeNull();
  });

  it("filters: NC counts as DT, CL never counts, NM means none", () => {
    expect(matchesMods([{ acronym: "NC" }, { acronym: "HD" }], [{ acronym: "DT" }])).toBe(true);
    expect(matchesMods([{ acronym: "CL" }], [])).toBe(true);
    expect(matchesMods([{ acronym: "HD" }], [])).toBe(false);
    expect(matchesMods([{ acronym: "HD" }], [{ acronym: "HR" }])).toBe(false);
    expect(matchesMods([{ acronym: "PF" }], [{ acronym: "SD" }])).toBe(true);
  });
});

describe("scores", () => {
  const a = makeScore({
    id: 1,
    pp: 300,
    accuracy: 0.9,
    maxCombo: 100,
    totalScore: 5,
    endedAt: "2026-01-01T00:00:00Z",
    mods: [{ acronym: "HD" }],
  });
  const b = makeScore({
    id: 2,
    pp: 200,
    accuracy: 0.99,
    maxCombo: 300,
    totalScore: 9,
    endedAt: "2026-03-01T00:00:00Z",
    statistics: { miss: 0 },
  });
  const c = makeScore({
    id: 3,
    pp: 100,
    accuracy: 0.95,
    maxCombo: 200,
    totalScore: 7,
    endedAt: "2026-02-01T00:00:00Z",
    statistics: { miss: 5 },
  });

  it("sorts, filters and keeps places", () => {
    const ids = (list: { score: { id: number } }[]) => list.map((entry) => entry.score.id);
    expect(ids(arrangeScores([a, b, c]))).toEqual([1, 2, 3]);
    expect(ids(arrangeScores([a, b, c], { sort: "recent" }))).toEqual([2, 3, 1]);
    expect(ids(arrangeScores([a, b, c], { sort: "accuracy" }))).toEqual([2, 3, 1]);
    expect(ids(arrangeScores([a, b, c], { sort: "combo" }))).toEqual([2, 3, 1]);
    expect(ids(arrangeScores([a, b, c], { sort: "score" }))).toEqual([2, 3, 1]);
    expect(ids(arrangeScores([a, b, c], { sort: "misses" }))).toEqual([2, 1, 3]);
    expect(ids(arrangeScores([a, b, c], { reverse: true }))).toEqual([3, 2, 1]);
    const hd = arrangeScores([a, b, c], { mods: [{ acronym: "HD" }] });
    expect(hd).toEqual([{ score: a, place: 1 }]);
  });

  it("pages", () => {
    expect(pageOf([1, 2, 3, 4, 5, 6, 7], 2, 5)).toEqual({ items: [6, 7], page: 2, pages: 2 });
    expect(pageOf([1, 2], 9, 5)).toEqual({ items: [1, 2], page: 1, pages: 1 });
    expect(pageOf([], Number.NaN)).toEqual({ items: [], page: 1, pages: 1 });
  });
});

describe("redact", () => {
  it("hides every secret, longest first, and bot tokens", () => {
    const token = "MTA1234567890123456789012.GaBcDe.abcdefghijklmnopqrstuvwxyz12345";
    expect(
      redact(`a secret-value b secret-value-long c ${token} 12345`, [
        "secret-value",
        "secret-value-long",
        12345,
        "abc",
      ]),
    ).toBe("a [redacted] b [redacted] c [redacted] 12345");
  });
});

describe("mapLimit", () => {
  it("keeps order and the limit", async () => {
    let running = 0;
    let peak = 0;
    const out = await mapLimit([1, 2, 3, 4, 5], 2, async (n) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5 - n));
      running -= 1;
      return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10]);
    expect(peak).toBe(2);
    expect(await mapLimit([], 3, async () => 1)).toEqual([]);
  });
});
