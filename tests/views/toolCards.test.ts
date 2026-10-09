/**
 * @file tests/views/toolCards.test.ts
 * @desc The match, pool, server and tracks card data parse against harumin-config's schemas,
 *       and cut what doesn't fit.
 * @author David @dvhsh (https://dvh.sh)
 * @created Thu Oct 8, 2026
 * @modified Thu Oct 8, 2026
 */

import {
  MAX_MATCH_ROWS,
  MAX_POOL_SLOTS,
  matchCostCardSchema,
  poolCardSchema,
  serverCardSchema,
  tracksCardSchema,
} from "@haruhimemoe/harumin-config";
import type { BeatmapMeta, OsuMatch } from "@haruhimemoe/osu";
import { describe, expect, it } from "vitest";
import {
  toMatchCostCard,
  toPoolCard,
  toPracticeCard,
  toServerCard,
  toTracksCard,
} from "../../src/views/toolCards.ts";
import { checkNote } from "../../src/views/tools.ts";

const game = (id: number, scores: [number, "red" | "blue", number][]) => ({
  id,
  type: "other",
  text: null,
  timestamp: "2026-10-06T00:00:00Z",
  userId: null,
  game: {
    id,
    beatmapId: 75,
    startTime: "2026-10-06T00:00:00Z",
    endTime: "2026-10-06T00:05:00Z",
    ruleset: "osu" as const,
    scoringType: "scorev2",
    teamType: "team-vs",
    mods: [],
    scores: scores.map(([userId, team, score], slot) => ({
      userId,
      slot,
      team,
      score,
      accuracy: 0.98,
      maxCombo: 100,
      misses: 0,
      mods: [],
      passed: true,
    })),
    beatmap: null,
  },
});

describe("tool cards", () => {
  it("ranks a match and caps the rows", () => {
    const match = {
      id: 9,
      name: "OWC: (A) vs (B)",
      startTime: "2026-10-06T00:00:00Z",
      endTime: null,
      events: [
        game(1, [
          [1, "red", 500],
          [2, "blue", 400],
        ]),
      ],
      users: [{ osuId: 1, username: "a", countryCode: "JP" }],
      firstEventId: 1,
      latestEventId: 1,
    } as unknown as OsuMatch;
    const costs = new Map(Array.from({ length: 20 }, (_, i) => [i + 1, 2 - i * 0.05]));
    const card = toMatchCostCard(match, costs, { formula: "bathbot", warmups: 1, complete: false });
    expect(matchCostCardSchema.parse(card)).toEqual(card);
    expect(card.rows).toHaveLength(MAX_MATCH_ROWS);
    expect(card.more).toBe(20 - MAX_MATCH_ROWS);
    expect(card.rows[0]).toMatchObject({ place: 1, username: "a", countryCode: "JP" });
    expect(card.rows[1]?.username).toBe("#2");
    expect(card.note).toContain("1 warmup skipped");
  });

  it("draws pools, checks and pasted pools", () => {
    const slots = Array.from({ length: 40 }, (_, i) => ({
      mod: "HD",
      index: i + 1,
      beatmapId: i + 1,
    }));
    const meta = new Map<number, BeatmapMeta>([
      [
        1,
        {
          artist: "x",
          title: "y",
          version: "z",
          starRating: 5.5,
          lengthSeconds: 90.4,
        } as BeatmapMeta,
      ],
      [
        2,
        {
          artist: "x",
          title: "y",
          version: "z",
          starRating: 6.5,
          lengthSeconds: 100,
        } as BeatmapMeta,
      ],
    ]);
    const card = toPoolCard({
      source: "check",
      name: "P".repeat(300),
      slots,
      meta,
      verdicts: new Map([[1, { status: "disallowed" as const }]]),
    });
    expect(poolCardSchema.parse(card)).toEqual(card);
    expect(card.slots).toHaveLength(MAX_POOL_SLOTS);
    expect(card.mapCount).toBe(40);
    expect(card.stars).toEqual({ min: 5.5, max: 6.5 });
    expect(card.slots[0]).toMatchObject({
      label: "HD1",
      mod: "HD",
      check: "disallowed",
      lengthSeconds: 90,
    });
    expect(card.slots[2]).toMatchObject({ title: null, stars: null, check: "unknown" });
    const plain = toPoolCard({ source: "pack", name: "", slots: [], meta: new Map() });
    expect(poolCardSchema.parse(plain).slots[0]).toBeUndefined();
    expect(plain.stars).toBeNull();
  });

  it("says how a check went", () => {
    const slot = { mod: "NM", index: 1, beatmapId: 1 };
    const ok = { slot, meta: undefined, verdict: { status: "ok" as const } };
    expect(checkNote([ok, ok])).toBe("All 2 maps are fine for official tournaments.");
    expect(
      checkNote([
        ok,
        { slot, meta: undefined, verdict: { status: "disallowed" } },
        { slot, meta: undefined, verdict: null },
      ]),
    ).toBe("1 of 3 maps are fine · 1 not allowed · 1 couldn't be checked");
  });

  it("draws a server page and the tracks list", () => {
    const server = toServerCard(
      { id: "123456789012345678", name: "s", icon: "not-a-hash" },
      [{ osuId: 2, username: "peppy", countryCode: "AU", value: "1,234pp" }],
      { ruleset: "osu", stat: "pp", start: 10, page: 2, pages: 0, total: 11 },
    );
    expect(serverCardSchema.parse(server)).toEqual(server);
    expect(server.guild.icon).toBeNull();
    expect(server.rows[0]?.place).toBe(11);
    expect(server.pages).toBe(1);
    const tracks = toTracksCard(
      [
        {
          guildId: "123456789012345678",
          channelId: "223456789012345678",
          osuId: 2,
          username: "peppy",
          mode: "mania",
          addedBy: "323456789012345678",
          addedAt: new Date(),
        },
      ],
      25,
      () => undefined,
    );
    expect(tracksCardSchema.parse(tracks).rows[0]).toMatchObject({ channel: "unknown-channel" });
  });
});

describe("toPracticeCard", () => {
  it("labels slots by bucket and spans the stars", () => {
    const card = toPracticeCard({
      name: "peppy's HR practice",
      subtitle: "HR · 6.40 stars · like your top plays",
      bucket: "HR",
      maps: [
        { beatmapId: 1, title: "A - B [C]", stars: 6.3, lengthSeconds: 90.4 },
        { beatmapId: 2, title: "D - E [F]", stars: 6.5, lengthSeconds: 120 },
      ],
    });
    expect(poolCardSchema.parse(card)).toEqual(card);
    expect(card).toMatchObject({
      source: "practice",
      mapCount: 2,
      stars: { min: 6.3, max: 6.5 },
      note: null,
    });
    expect(card.slots.map((slot) => [slot.label, slot.mod, slot.lengthSeconds])).toEqual([
      ["HR1", "HR", 90],
      ["HR2", "HR", 120],
    ]);
  });
});
