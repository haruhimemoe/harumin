/**
 * @file tests/views/practice.test.ts
 * @desc /practice's picker: mods into buckets, the target bucket and stars from top plays, and
 *       the closest new maps from pools' answers.
 * @author David @dvhsh (https://dvh.sh)
 * @created Thu Oct 8, 2026
 * @modified Thu Oct 8, 2026
 */

import { describe, expect, it } from "vitest";
import { bucketOf, pickPractice, practiceTarget } from "../../src/views/practice.ts";

describe("bucketOf", () => {
  it.each([
    [[], "NM"],
    [["NF"], "NM"],
    [["HD"], "HD"],
    [["HD", "SD"], "HD"],
    [["NC"], "DT"],
    [["HD", "HR"], "FM"],
    [["EZ"], "FM"],
  ])("%j is %s", (mods, bucket) => expect(bucketOf(mods)).toBe(bucket));
});

describe("practiceTarget", () => {
  const top = [
    { beatmapId: 1, mods: ["HR"], stars: 6.0 },
    { beatmapId: 2, mods: ["HR"], stars: 6.4 },
    { beatmapId: 3, mods: [], stars: 5.0 },
  ];
  it("picks the most common bucket and median + 0.2", () =>
    expect(practiceTarget(top)).toEqual({ bucket: "HR", stars: 6.4 }));
  it("takes a given bucket", () =>
    expect(practiceTarget(top, "NM")).toEqual({ bucket: "NM", stars: 5.2 }));
  it("is null for a bucket with no plays", () => expect(practiceTarget(top, "DT")).toBeNull());
  it("is null for no plays", () => expect(practiceTarget([])).toBeNull());
  it("reads the median from the top 50 when the bucket has plays there", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      beatmapId: i,
      mods: ["DT"],
      stars: i < 50 ? 7 : 3,
    }));
    expect(practiceTarget(many)).toEqual({ bucket: "DT", stars: 7.2 });
  });
});

describe("pickPractice", () => {
  const c = (beatmapId: number, stars: number, similarity = 0.9) => ({
    beatmapId,
    title: `m${beatmapId}`,
    stars,
    lengthSeconds: 120,
    similarity,
  });
  it("drops excluded and duplicate maps and keeps the closest to the target", () => {
    const out = pickPractice(
      { bucket: "HR", stars: 6.0 },
      [c(1, 6.0), c(2, 7.5), c(3, 6.1), c(3, 6.1), c(4, 5.95)],
      new Set([1]),
      2,
    );
    expect(out.map((m) => m.beatmapId)).toEqual([4, 3]);
  });
  it("breaks ties by similarity, then id", () => {
    const out = pickPractice(
      { bucket: "NM", stars: 5 },
      [c(9, 5.1, 0.5), c(8, 4.9, 0.5), c(7, 5.1, 0.8)],
      new Set(),
      3,
    );
    expect(out.map((m) => m.beatmapId)).toEqual([7, 8, 9]);
  });
});
