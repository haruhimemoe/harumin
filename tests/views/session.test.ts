import { describe, expect, it } from "vitest";
import { sessionOf } from "../../src/views/session.ts";

const s = (beatmapId: number, passed: boolean, accuracy: number, totalScore: number) => ({
  beatmapId,
  passed,
  accuracy,
  totalScore,
});

describe("sessionOf", () => {
  it("has no note for a lone attempt", () => {
    expect(sessionOf([s(1, true, 98, 900)], 0)).toEqual({ today: 1, note: null });
  });

  it("says first pass after fails", () => {
    const list = [
      s(1, true, 95, 800),
      s(1, false, 90, 300),
      s(2, true, 99, 999),
      s(1, false, 88, 200),
    ];
    expect(sessionOf(list, 0)).toEqual({ today: 3, note: "first pass after 2 fails" });
  });

  it("says best of n when it beats every other attempt", () => {
    const list = [s(1, true, 97, 900), s(1, true, 96, 800), s(1, true, 95, 700)];
    expect(sessionOf(list, 0)).toEqual({ today: 3, note: "best of 3" });
  });

  it("points at the better attempt otherwise", () => {
    const list = [s(1, true, 95, 700), s(1, true, 96, 800), s(1, true, 97.12, 900)];
    expect(sessionOf(list, 0)).toEqual({ today: 3, note: "best was 97.12%, 2 tries ago" });
  });

  it("only counts plays older than the shown one for first pass", () => {
    const list = [s(1, false, 50, 10), s(1, true, 95, 800), s(1, false, 60, 20)];
    expect(sessionOf(list, 1).note).toBe("first pass after 1 fail");
  });

  it("ranks a pass above a higher-scoring fail", () => {
    const list = [s(1, true, 90, 100), s(1, false, 99, 999_999)];
    expect(sessionOf(list, 0).note).toBe("first pass after 1 fail");
    const later = [s(1, false, 99, 999_999), s(1, true, 90, 100), s(1, true, 80, 50)];
    expect(sessionOf(later, 1).note).toBe("best of 3");
  });
});
