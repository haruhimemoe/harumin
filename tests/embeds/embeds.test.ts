/**
 * @file tests/embeds/embeds.test.ts
 * @desc Every embed builder: what each card shows for typical and edge data.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import type { OsuMatch } from "@haruhimemoe/osu";
import { describe, expect, it } from "vitest";
import { commandHelpEmbed, helpEmbed, infoEmbed, linkEmbed, usage } from "../../src/embeds/bot.ts";
import { card, notice, problem } from "../../src/embeds/common.ts";
import {
  compareEmbed,
  leaderboardEmbed,
  mapEmbed,
  mapTitle,
  playerAuthor,
  profileEmbed,
  scoreEmbed,
  scoreListEmbed,
  simulateEmbed,
} from "../../src/embeds/osu.ts";
import {
  matchCostEmbed,
  serverEmbed,
  trackListEmbed,
  weightedPp,
} from "../../src/embeds/social.ts";
import {
  bbPreviewEmbed,
  bucketCounts,
  matchSummaryEmbed,
  parsedPoolEmbed,
  poolCardEmbed,
  poolCheckEmbed,
  starSpan,
} from "../../src/embeds/tools.ts";
import { publicCommands } from "../../src/registry.ts";
import { makeMap, makeProfile, makeScore } from "../helpers.ts";

const GUILD = "123456789012345678";

describe("common", () => {
  it("colors and footers", () => {
    expect(card({ title: "x" })).toMatchObject({ title: "x", footer: { text: "harumin" } });
    expect(notice("hi").description).toBe("hi");
    expect(problem("no").color).not.toBe(notice("x").color);
  });
});

describe("osu cards", () => {
  it("profile", () => {
    const embed = profileEmbed(makeProfile(), "osu");
    expect(embed.title).toContain("peppy");
    expect(embed.description).toContain("**#100** global");
    expect(embed.description).toContain("supporter");
    const unranked = profileEmbed(
      makeProfile({
        joinDate: null,
        avatarUrl: null,
        coverUrl: "c",
        statistics: { ...makeProfile().statistics, globalRank: null },
      }),
      "mania",
    );
    expect(unranked.description).toContain("Unranked");
    expect(unranked.image?.url).toBe("c");
    expect(unranked.thumbnail).toBeUndefined();
  });

  it("author line", () => {
    expect(playerAuthor(makeProfile()).name).toBe("peppy 🇦🇺 · 1,235pp (#100)");
    expect(playerAuthor({ osuId: 1, username: "x", avatarUrl: null, countryCode: null }).name).toBe(
      "x",
    );
    expect(mapTitle({ beatmap: null, beatmapset: null })).toBe("Beatmap");
  });

  it("score with computed pp and FC pp, and a fail", () => {
    const pp = { pp: 90, fcPp: 120, fcAccuracy: 99.1, stars: 6.1, maxCombo: 132 };
    const embed = scoreEmbed(makeScore({ pp: null }), {
      pp,
      heading: "Most recent play",
      tries: 3,
    });
    expect(embed.description).toContain("≈90.00pp");
    expect(embed.description).toContain("FC 120.00pp at 99.10%");
    expect(embed.description).toContain("6.10★");
    expect(embed.description).toContain("Try #3");
    expect(embed.author?.name).toContain("peppy");
    const failed = scoreEmbed(
      makeScore({ passed: false, rank: "F", pp: null, statistics: { great: 58 } }),
      { pp: null },
    );
    expect(failed.description).toContain("**F** (50.0%)");
    expect(failed.description).toContain("no pp");
    const fc = scoreEmbed(makeScore({ perfectCombo: true }), { pp });
    expect(fc.description).not.toContain("FC ");
    const bare = scoreEmbed(makeScore({ beatmap: null, beatmapset: null, user: null }), {
      pp: null,
    });
    expect(bare.thumbnail).toBeUndefined();
    expect(bare.author).toBeUndefined();
  });

  it("score lists", () => {
    const list = scoreListEmbed([{ score: makeScore(), place: 7 }], {
      title: "Top",
      page: 2,
      pages: 3,
      note: "Sorted",
      player: makeProfile(),
      url: "u",
    });
    expect(list.description).toContain("**#7**");
    expect(list.footer?.text).toContain("Page 2 of 3");
    expect(scoreListEmbed([], { title: "x", page: 1, pages: 1 }).description).toBe("Nothing here.");
  });

  it("map card with and without rosu", () => {
    const full = mapEmbed(makeMap(), {
      mods: [{ acronym: "DT" }],
      stars: 4,
      attrs: { stars: 4, maxCombo: 300, ar: 9, od: 8, cs: 4, hp: 5, clockRate: 1.5 },
      pps: [{ accuracy: 95, pp: 100.4 }],
    });
    expect(full.fields?.[0]?.value).toContain("**4.00★** · +DT");
    expect(full.fields?.[1]?.value).toContain("1:35 · 180 BPM");
    expect(full.fields?.[2]?.value).toBe("95% **100**");
    const plain = mapEmbed(makeMap({ maxCombo: null, status: null, creatorId: null }), {
      mods: [],
      stars: null,
    });
    expect(plain.fields).toHaveLength(2);
    expect(plain.fields?.[1]?.value).toContain("unknown");
    expect(plain.fields?.[0]?.value).toContain("2.55★");
  });

  it("leaderboard", () => {
    const board = leaderboardEmbed(makeMap(), [makeScore(), makeScore({ user: null })], {
      start: 10,
      page: 2,
      pages: 3,
      mods: "+HD",
    });
    expect(board.description).toContain("`#11`");
    expect(board.description).toContain("Only +HD");
    expect(board.description).toContain("**?**");
    expect(
      leaderboardEmbed(makeMap(), [], { start: 0, page: 1, pages: 1, mods: null }).description,
    ).toContain("Global top 100");
  });

  it("compare bolds the better side", () => {
    const a = { profile: makeProfile(), top: [makeScore({ pp: 500 })] };
    const b = {
      profile: makeProfile({
        username: "b",
        statistics: { ...makeProfile().statistics, pp: 99, globalRank: null },
      }),
      top: [],
    };
    const embed = compareEmbed(a, b, "osu");
    expect(embed.title).toBe("peppy vs b");
    expect(embed.description).toContain("**#100** · rank · —");
    expect(embed.description).toContain("**500pp** · top play · 0pp");
  });

  it("simulate", () => {
    const embed = simulateEmbed(
      makeMap(),
      { pp: 123.4, stars: 5, maxCombo: 300 },
      { mods: "+HD", misses: 1 },
    );
    expect(embed.description).toContain("123.40pp");
    expect(embed.description).toContain("1 miss");
    expect(
      simulateEmbed(
        makeMap(),
        { pp: 1, stars: 1, maxCombo: 3 },
        { mods: "NM", accuracy: 98, combo: 2 },
      ).description,
    ).toContain("98% · x2/3 · 0 misses");
  });
});

describe("bot cards", () => {
  it("help lists every public command by category", () => {
    const help = helpEmbed(publicCommands());
    const all = help.fields?.map((field) => field.value).join("\n") ?? "";
    for (const command of publicCommands()) expect(all).toContain(`/${command.data.name}\``);
    expect(all).not.toContain("/eval");
  });

  it("command help shows usage, and subcommands", () => {
    const top = publicCommands().find((c) => c.data.name === "top");
    const pool = publicCommands().find((c) => c.data.name === "pool");
    expect(top && commandHelpEmbed(top).description).toContain(
      "`/top [name] [discord] [mode] [sort] [mods] [reverse]`",
    );
    expect(pool && commandHelpEmbed(pool).description).toContain("/pool check [pool]");
    expect(usage("x", [{ name: "a", description: "d", type: 3, required: true }])).toBe("/x <a>");
  });

  it("info and link", () => {
    expect(infoEmbed({ guilds: 1234, uptimeMs: 3_900_000, pingMs: 42.4 }).description).toContain(
      "**1,234** servers · up 1h 5m · 42ms",
    );
    expect(linkEmbed(null, "https://haruhime.moe").title).toBe("Link your osu! account");
    expect(
      linkEmbed({ osuId: 2, username: "peppy" }, "https://haruhime.moe").description,
    ).toContain("peppy");
  });
});

describe("social cards", () => {
  it("server", () => {
    const rows = [
      {
        discordId: GUILD,
        username: "a",
        osuId: 1,
        countryCode: "US",
        value: Number.MAX_SAFE_INTEGER,
      },
    ];
    const embed = serverEmbed("osu!", rows, {
      stat: "rank",
      ruleset: "osu",
      start: 0,
      page: 1,
      pages: 2,
      total: 11,
    });
    expect(embed.description).toContain("unranked");
    expect(embed.footer?.text).toContain("Page 1 of 2");
    expect(
      serverEmbed("x", [], { stat: "pp", ruleset: "osu", start: 0, page: 1, pages: 1, total: 0 })
        .description,
    ).toContain("Nobody");
    for (const stat of ["pp", "accuracy", "playcount", "level"] as const) {
      expect(
        serverEmbed("x", [{ ...(rows[0] as (typeof rows)[number]), value: 1 }], {
          stat,
          ruleset: "osu",
          start: 0,
          page: 1,
          pages: 1,
          total: 1,
        }).description,
      ).toContain("`# 1`");
    }
  });

  it("track list", () => {
    expect(trackListEmbed([], 25).description).toContain("Nobody yet");
    const entry = {
      guildId: GUILD,
      channelId: GUILD,
      osuId: 2,
      username: "peppy",
      mode: "osu" as const,
      addedBy: GUILD,
      addedAt: new Date(),
    };
    expect(trackListEmbed([entry], 25).title).toBe("Tracked players (1/25)");
  });

  it("match costs and weighted pp", () => {
    const match = {
      id: 1,
      name: "OWC: (A) vs (B)",
      startTime: "2026-10-06T00:00:00Z",
      endTime: null,
      events: [],
      users: [{ osuId: 2, username: "peppy", avatarUrl: null, countryCode: "AU" }],
      firstEventId: 1,
      latestEventId: 1,
    } satisfies OsuMatch;
    const embed = matchCostEmbed(
      match,
      new Map([
        [2, 1.234],
        [3, 0.9],
      ]),
      { formula: "bathbot", warmups: 1, complete: false },
    );
    expect(embed.description).toContain("**1.23**");
    expect(embed.description).toContain("#3");
    expect(embed.description).toContain("1 warmup skipped");
    expect(matchSummaryEmbed(match).description).toContain("still open");
    expect(weightedPp([100, 200])).toBeCloseTo(295);
  });
});

describe("tool cards", () => {
  const slots = [
    { mod: "NM", index: 1, beatmapId: 75 },
    { mod: "NM", index: 2, beatmapId: 76 },
    { mod: "HD", index: 1, beatmapId: 77 },
    { mod: null, index: 1, beatmapId: 78 },
  ];
  const meta = new Map([
    [75, { ...makeMap(), starRating: 4.5 }],
    [77, { ...makeMap({ beatmapId: 77 }), starRating: 6.2 }],
  ]);

  it("pool and pack cards", () => {
    expect(bucketCounts(slots)).toBe("NM 2 · HD 1 · — 1");
    expect(starSpan(slots, meta)).toBe("4.50–6.20★");
    expect(starSpan(slots, new Map())).toBeNull();
    const embed = poolCardEmbed(
      { name: "", slots, url: "u", kind: "pool", subtitle: "OWC · QF" },
      meta,
    );
    expect(embed.title).toBe("Untitled");
    expect(embed.description).toContain("**4** maps · 4.50–6.20★");
    expect(embed.description).toContain("`NM1 `");
    const many = Array.from({ length: 25 }, (_, i) => ({
      mod: "NM",
      index: i + 1,
      beatmapId: 1000 + i,
    }));
    expect(
      poolCardEmbed({ name: "x", slots: many, url: "u", kind: "pack", description: "d" }, new Map())
        .description,
    ).toContain("and 5 more");
  });

  it("pool check colors and groups", () => {
    const rows = [
      {
        slot: slots[0] as (typeof slots)[number],
        meta: meta.get(75),
        verdict: { status: "ok" as const },
      },
      {
        slot: slots[1] as (typeof slots)[number],
        meta: undefined,
        verdict: { status: "disallowed" as const, reason: "dmca" as const },
      },
      {
        slot: slots[2] as (typeof slots)[number],
        meta: undefined,
        verdict: { status: "potential" as const },
      },
      { slot: slots[3] as (typeof slots)[number], meta: undefined, verdict: null },
    ];
    const embed = poolCheckEmbed("Pool", rows);
    expect(embed.description).toContain("1 of 4 maps are fine");
    expect(embed.description).toContain("**Not allowed**");
    expect(embed.description).toContain("**Couldn't check**");
    expect(poolCheckEmbed("", [rows[0] as (typeof rows)[number]]).description).toContain(
      "All 1 maps are fine",
    );
  });

  it("parsed pool and bb", () => {
    const embed = parsedPoolEmbed(
      slots.slice(0, 1),
      [{ line: 2, text: "x", code: "unrecognized", reason: "bad" }],
      "https://packs.haruhime.moe/k#pk1.x",
    );
    expect(embed.title).toBe("Read 1 map");
    expect(embed.description).toContain("Line 2: bad");
    expect(parsedPoolEmbed(slots, [], null).url).toBeUndefined();
    expect(bbPreviewEmbed("abc123").url).toBe("https://bb.haruhime.moe/t/abc123");
  });
});
