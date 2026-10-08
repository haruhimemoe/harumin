import { describe, expect, it, vi } from "vitest";
import { createUserSettings } from "../../src/services/userSettings.ts";
import { bestOf, favoriteLine } from "../../src/views/best.ts";
import { makeScore } from "../helpers.ts";

describe("createUserSettings", () => {
  it("caches reads, rereads after drop, and answers defaults when the DB throws", async () => {
    const load = vi.fn(async (osuId: number) => (osuId === 2 ? { osuId: 2, accent: "sky" } : null));
    const settings = createUserSettings(load);
    expect((await settings.get(2)).accent).toBe("sky");
    expect((await settings.get(2)).accent).toBe("sky");
    expect(load).toHaveBeenCalledTimes(1);
    expect((await settings.get(3)).accent).toBe("rose");
    await settings.get(3);
    expect(load).toHaveBeenCalledTimes(2);
    settings.drop(2);
    await settings.get(2);
    expect(load).toHaveBeenCalledTimes(3);
    const broken = createUserSettings(async () => {
      throw new Error("down");
    });
    expect(await broken.get(2)).toMatchObject({ osuId: 2, accent: "rose", cover: "profile" });
  });

  it("expires after 10 minutes", async () => {
    let t = 0;
    const load = vi.fn(async () => null);
    const settings = createUserSettings(load, () => t);
    await settings.get(2);
    t = 10 * 60_000 + 1;
    await settings.get(2);
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe("bestOf", () => {
  it("picks pp first, then total score", () => {
    const a = makeScore({ pp: 100, totalScore: 5 });
    const b = makeScore({ pp: 200, totalScore: 1 });
    const c = makeScore({ pp: 200, totalScore: 9 });
    expect(bestOf([a, b, c])).toBe(c);
    expect(bestOf([])).toBeNull();
  });
});

describe("favoriteLine", () => {
  it("names the best score's map with its pp and mods, and caches", async () => {
    const score = makeScore({ pp: 727, beatmap: null, beatmapset: null });
    const osu = {
      getBeatmapUserScores: vi.fn(async () => [score]),
      getBeatmap: vi.fn(async () => ({
        artist: "xi",
        title: "FREEDOM DiVE",
        version: "FOUR DIMENSIONS",
      })),
    };
    const s = { osu } as never;
    const line = await favoriteLine(s, 2, 129891, "osu");
    expect(line).toEqual({
      title: "xi - FREEDOM DiVE [FOUR DIMENSIONS]",
      pp: 727,
      mods: score.mods.map((m) => m.acronym),
    });
    await favoriteLine(s, 2, 129891, "osu");
    expect(osu.getBeatmapUserScores).toHaveBeenCalledTimes(1);
  });

  it("is null with no score or on an error", async () => {
    const none = {
      osu: { getBeatmapUserScores: async () => [], getBeatmap: async () => null },
    } as never;
    expect(await favoriteLine(none, 2, 1, "osu")).toBeNull();
    const broken = {
      osu: {
        getBeatmapUserScores: async () => {
          throw new Error("x");
        },
        getBeatmap: async () => null,
      },
    } as never;
    expect(await favoriteLine(broken, 2, 2, "osu")).toBeNull();
  });
});
