import { describe, expect, it } from "vitest";
import { autocompleteChoices } from "../../src/commands/autocomplete.ts";
import { createLookups } from "../../src/services/lookups.ts";

const base = { members: [], recentNames: [], maps: [] };

describe("autocompleteChoices", () => {
  it("puts what was typed first, even with no match", () => {
    const out = autocompleteChoices({
      ...base,
      focused: "map",
      typed: "https://osu.ppy.sh/b/129891",
    });
    expect(out[0]).toEqual({
      name: "https://osu.ppy.sh/b/129891",
      value: "https://osu.ppy.sh/b/129891",
    });
  });

  it("orders members before recent names and filters by prefix, case-blind", () => {
    const out = autocompleteChoices({
      ...base,
      focused: "name",
      typed: "co",
      members: [
        { username: "Cookiezi", rank: 1 },
        { username: "peppy", rank: null },
      ],
      recentNames: ["cottonmouth", "Cookiezi"],
    });
    expect(out.map((c) => c.value)).toEqual(["co", "Cookiezi", "cottonmouth"]);
    expect(out[1]?.name).toBe("Cookiezi · #1");
    const same = autocompleteChoices({
      ...base,
      focused: "name",
      typed: "cookiezi",
      members: [{ username: "Cookiezi", rank: 1 }],
    });
    expect(same.map((c) => c.value)).toEqual(["Cookiezi"]);
  });

  it("caps at 25 and keeps names and values at 100 characters or fewer", () => {
    const maps = Array.from({ length: 40 }, (_, i) => ({
      beatmapId: i + 1,
      label: "x".repeat(150),
    }));
    const out = autocompleteChoices({ ...base, focused: "map", typed: "", maps });
    expect(out).toHaveLength(25);
    expect(out.every((c) => c.name.length <= 100 && c.value.length <= 100)).toBe(true);
    expect(out[0]?.value).toBe("1");
    const long = autocompleteChoices({ ...base, focused: "map", typed: "y".repeat(300) });
    expect(long[0]?.value).toHaveLength(100);
    const name = autocompleteChoices({ ...base, focused: "name", typed: "z".repeat(300) });
    expect(name[0]?.value).toHaveLength(64);
  });

  it("matches maps by label words", () => {
    const out = autocompleteChoices({
      ...base,
      focused: "map",
      typed: "freedom",
      maps: [
        { beatmapId: 129891, label: "xi - FREEDOM DiVE [FOUR DIMENSIONS] · 7.07★" },
        { beatmapId: 2, label: "other" },
      ],
    });
    expect(out.map((c) => c.value)).toEqual(["freedom", "129891"]);
  });
});

describe("createLookups", () => {
  it("keeps 20 names per user, newest first, deduped, for a day", () => {
    let t = 0;
    const lookups = createLookups(() => t);
    for (let i = 0; i < 25; i++) lookups.note("u", `p${i}`);
    lookups.note("u", "P3");
    const names = lookups.recent("u");
    expect(names).toHaveLength(20);
    expect(names[0]).toBe("P3");
    expect(names.filter((n) => n.toLowerCase() === "p3")).toHaveLength(1);
    expect(lookups.recent("other")).toEqual([]);
    t = 25 * 60 * 60_000;
    expect(lookups.recent("u")).toEqual([]);
  });
});
