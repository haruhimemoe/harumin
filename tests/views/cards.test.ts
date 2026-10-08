/**
 * @file tests/views/cards.test.ts
 * @desc Card images: osu! data turned into harumin-config's card shapes (pp rules, fails, odd
 *       covers and mods dropped, every card parses), and the card client against a fake site
 *       (bearer and route, PNG check, failures read as null).
 * @author David @dvhsh (https://dvh.sh)
 * @created Wed Oct 7, 2026
 * @modified Wed Oct 7, 2026
 */

import {
  compareCardSchema,
  leaderboardCardSchema,
  mapCardSchema,
  profileCardSchema,
  scoreCardSchema,
  scoreListCardSchema,
  simulateCardSchema,
} from "@haruhimemoe/harumin-config";
import { describe, expect, it, vi } from "vitest";
import { createCards } from "../../src/services/cards.ts";
import {
  toCardPlayer,
  toCardScore,
  toCompareCard,
  toLeaderboardCard,
  toMapCard,
  toProfileCard,
  toScoreCard,
  toScoreListCard,
  toSimulateCard,
} from "../../src/views/cards.ts";
import { makeMap, makeProfile, makeScore } from "../helpers.ts";

const PP = { pp: 150, fcPp: 180, fcAccuracy: 98.4, stars: 6.1, maxCombo: 132 };

describe("card views", () => {
  it("makes a profile card that parses", () => {
    const card = toProfileCard(makeProfile(), "osu");
    expect(profileCardSchema.parse(card)).toEqual(card);
    expect(card.joinDate).toBe("2007-08-28T03:09:12.000Z");
    expect(card.player).toMatchObject({ osuId: 2, countryCode: "AU", globalRank: 100 });
  });

  it("drops covers off assets.ppy.sh and bad country codes", () => {
    const player = toCardPlayer(
      makeProfile({ coverUrl: "https://evil.example/c.png", countryCode: "xx1" }),
    );
    expect(player.coverUrl).toBeNull();
    expect(player.countryCode).toBeNull();
    const kept = toCardPlayer(makeProfile({ coverUrl: "https://assets.ppy.sh/c.jpeg" }));
    expect(kept.coverUrl).toBe("https://assets.ppy.sh/c.jpeg");
  });

  it("shows osu!'s pp, and the full-combo pp when it wasn't one", () => {
    const card = toCardScore(makeScore({ mods: [{ acronym: "HD" }, { acronym: "??" }] }), PP);
    expect(card).toMatchObject({
      pp: 100,
      ppApprox: false,
      fcPp: 180,
      fcAccuracy: 98.4,
      accuracy: 98,
      mods: ["HD"],
      mapMaxCombo: 132,
      completion: null,
    });
    expect(card.map.stars).toBe(6.1);
    expect(card.hits.map((hit) => hit.label)).toEqual(["300", "100", "50", "miss"]);
  });

  it("uses the title and artist in their own script when osu! has them", () => {
    const set = makeScore().beatmapset;
    const card = toCardScore(
      makeScore({
        beatmapset: set && { ...set, titleUnicode: "ディスコプリンス", artistUnicode: "" },
      }),
      null,
    );
    expect(card.map).toMatchObject({ title: "ディスコプリンス", artist: "Kenji Ninuma" });
  });

  it("marks rosu's pp approximate and gives fails no pp", () => {
    expect(toCardScore(makeScore({ pp: null }), PP)).toMatchObject({ pp: 150, ppApprox: true });
    const fail = toCardScore(makeScore({ pp: null, passed: false, rank: "F" }), PP);
    expect(fail).toMatchObject({ pp: null, ppApprox: false, fcPp: null, grade: "F" });
    expect(fail.completion).toBeCloseTo((116 / 116) * 100);
  });

  it("leaves the full-combo pp out of a full combo", () => {
    const fc = toCardScore(makeScore({ maxCombo: 132, statistics: { great: 116, miss: 0 } }), PP);
    expect(fc.fcPp).toBeNull();
  });

  it("makes score and list cards that parse", () => {
    const score = toScoreCard(makeScore(), {
      profile: makeProfile(),
      ruleset: "osu",
      pp: null,
      heading: "Most recent play",
      tries: 1,
    });
    expect(score.tries).toBeNull();
    expect(scoreCardSchema.safeParse(score).success).toBe(true);
    const list = toScoreListCard(
      [1, 2, 3].map((place) => ({ place, score: makeScore({ ruleset: "mania" }) })),
      {
        profile: makeProfile(),
        ruleset: "mania",
        title: "Top plays",
        note: null,
        page: 1,
        pages: 0,
      },
    );
    expect(list.pages).toBe(1);
    expect(list.rows[0]?.score.hits[0]?.label).toBe("MAX");
    expect(scoreListCardSchema.safeParse(list).success).toBe(true);
  });

  it("puts the full-combo pp on list rows that have rosu's numbers", () => {
    const choke = makeScore({ statistics: { great: 100, miss: 2 }, perfectCombo: false });
    const list = toScoreListCard([{ place: 1, score: choke, pp: PP }], {
      profile: makeProfile(),
      ruleset: "osu",
      title: "Without chokes",
      note: null,
      page: 1,
      pages: 1,
    });
    expect(list.rows[0]?.score.fcPp).toBe(180);
  });

  it("makes a map card with the mods' speed, and no AR or OD where the ruleset has none", () => {
    const map = makeMap({ lengthSeconds: 150, bpm: 200 });
    const attrs = { stars: 7, maxCombo: 900, ar: 10.3, od: 10, cs: 4, hp: 6, clockRate: 1.5 };
    const card = toMapCard(map, {
      mods: [{ acronym: "DT" }],
      stars: null,
      attrs,
      pps: [{ accuracy: 100, pp: 500 }],
    });
    expect(card).toMatchObject({ lengthSeconds: 100, bpm: 300, ar: 10.3, maxCombo: 900 });
    expect(card.map.stars).toBe(7);
    expect(mapCardSchema.safeParse(card).success).toBe(true);
    const bare = { mods: [], stars: null, attrs: null, pps: null };
    const mania = toMapCard(makeMap({ mode: "mania" }), bare);
    expect(mania.ar).toBeNull();
    expect(mania.pps).toEqual([]);
    expect(toMapCard(makeMap({ mode: "fruits" }), bare).od).toBeNull();
  });

  it("makes leaderboard, simulate and compare cards that parse", () => {
    const map = makeMap();
    const board = toLeaderboardCard(map, [makeScore(), makeScore({ user: null })], {
      start: 10,
      page: 2,
      pages: 10,
      filter: null,
    });
    expect(board.rows.map((row) => row.place)).toEqual([11, 12]);
    expect(board.rows[1]?.username).toBe("?");
    expect(leaderboardCardSchema.safeParse(board).success).toBe(true);
    const sim = toSimulateCard(
      map,
      { pp: 300, stars: 6, maxCombo: 500 },
      { mods: [{ acronym: "HD" }], combo: 9999 },
    );
    expect(sim).toMatchObject({ accuracy: 100, combo: 500, misses: 0 });
    expect(simulateCardSchema.safeParse(sim).success).toBe(true);
    const side = { profile: makeProfile(), top: [makeScore()] };
    const compare = toCompareCard(side, { ...side, top: [] }, "osu");
    expect(compare.b.topPp).toBeNull();
    expect(compareCardSchema.safeParse(compare).success).toBe(true);
  });
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("card client", () => {
  const card = toProfileCard(makeProfile(), "osu");

  it("posts the card with the bearer and returns the PNG", async () => {
    const fetch = vi.fn(
      async () => new Response(PNG, { headers: { "Content-Type": "image/png" } }),
    );
    const cards = createCards({ siteUrl: "https://site.test", token: "secret", fetch });
    const png = await cards.draw("profile", card);
    expect(png && [...png]).toEqual([...PNG]);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://site.test/api/cards/profile");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret");
    expect(JSON.parse(String(init.body))).toEqual(card);
  });

  it("reads errors, non-PNGs, throws and bad cards as null", async () => {
    const log = vi.fn();
    const answers = [
      async () => new Response("nope", { status: 500 }),
      async () => new Response("<html>"),
      async () => {
        throw new Error("timeout");
      },
    ];
    for (const answer of answers) {
      const cards = createCards({ siteUrl: "https://site.test", token: "t", fetch: answer, log });
      expect(await cards.draw("profile", card)).toBeNull();
    }
    const fetch = vi.fn();
    const cards = createCards({ siteUrl: "https://site.test", token: "t", fetch, log });
    expect(await cards.draw("profile", { ...card, accuracy: 200 })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(4);
  });
});
