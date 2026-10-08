/**
 * @file tests/services/core.test.ts
 * @desc The small services: the token bucket, the TTL cache, linking with its cache, player and
 *       ruleset resolution, settings with defaults and invalidation, channel context.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { describe, expect, it, vi } from "vitest";
import { createBudget } from "../../src/services/budget.ts";
import { createTtlCache } from "../../src/services/cache.ts";
import { createChannelContext } from "../../src/services/context.ts";
import { createLinking } from "../../src/services/linking.ts";
import {
  parsePlayerInput,
  pickRuleset,
  playerKey,
  resolvePlayer,
} from "../../src/services/players.ts";
import { createSettings, DM_SETTINGS } from "../../src/services/settings.ts";
import { clock } from "../helpers.ts";

const GUILD = "123456789012345678";

describe("budget", () => {
  it("starts with the burst and refills over time", async () => {
    const time = clock();
    const budget = createBudget({
      perMinute: 60,
      burst: 2,
      now: time.now,
      sleep: async (ms) => void time.advance(ms),
    });
    expect(budget.take()).toBe(true);
    expect(budget.take()).toBe(true);
    expect(budget.take()).toBe(false);
    time.advance(1_000);
    expect(budget.available()).toBeCloseTo(1);
    expect(await budget.acquire()).toBe(true);
    expect(await budget.acquire(500)).toBe(false);
    expect(await budget.acquire(5_000)).toBe(true);
  });

  it("defaults the burst to a quarter minute", () => {
    expect(createBudget({ perMinute: 120 }).available()).toBe(30);
  });
});

describe("ttl cache", () => {
  it("expires and caps entries", () => {
    const time = clock();
    const cache = createTtlCache<string, number>(100, 2, time.now);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.size()).toBe(2);
    time.advance(100);
    expect(cache.get("b")).toBeUndefined();
    cache.set("d", 4);
    cache.delete("d");
    expect(cache.get("d")).toBeUndefined();
  });
});

describe("linking", () => {
  it("caches hits and misses, and batches", async () => {
    const lookup = vi.fn(async (id: string) =>
      id === "1" ? { osuId: 2, username: "peppy" } : null,
    );
    const batch = vi.fn(
      async (ids: readonly string[]) =>
        new Map(ids.filter((id) => id === "3").map((id) => [id, { osuId: 4, username: "x" }])),
    );
    const linking = createLinking(lookup, batch);
    expect(await linking.get("1")).toEqual({ osuId: 2, username: "peppy" });
    expect(await linking.get("1")).toEqual({ osuId: 2, username: "peppy" });
    expect(await linking.get("9")).toBeNull();
    expect(await linking.get("9")).toBeNull();
    expect(lookup).toHaveBeenCalledTimes(2);
    const many = await linking.getMany(["1", "3", "5", "9"]);
    expect([...many.keys()]).toEqual(["1", "3"]);
    expect(batch).toHaveBeenCalledWith(["3", "5"]);
    expect((await linking.getMany(["3", "5"])).size).toBe(1);
    expect(batch).toHaveBeenCalledTimes(1);
  });
});

describe("players", () => {
  it("parses names, profile links and #ids", () => {
    expect(parsePlayerInput(" peppy ")).toEqual({ kind: "name", name: "peppy" });
    expect(parsePlayerInput("https://osu.ppy.sh/users/2/osu")).toEqual({ kind: "id", osuId: 2 });
    expect(parsePlayerInput("osu.ppy.sh/u/124493")).toEqual({ kind: "id", osuId: 124493 });
    expect(parsePlayerInput("#7")).toEqual({ kind: "id", osuId: 7 });
    expect(parsePlayerInput("")).toBeNull();
    expect(parsePlayerInput("a".repeat(16))).toBeNull();
    expect(parsePlayerInput("a".repeat(70))).toBeNull();
    expect(playerKey({ kind: "id", osuId: 2 })).toBe(2);
    expect(playerKey({ kind: "name", name: "x" })).toBe("x");
  });

  it("resolves name, then mention, then caller", async () => {
    const linking = {
      get: async (id: string) => (id === "me" ? { osuId: 9, username: "me" } : null),
    };
    expect(await resolvePlayer({ name: "peppy", callerId: "me" }, linking)).toMatchObject({
      ok: true,
      linked: false,
    });
    expect(await resolvePlayer({ callerId: "me" }, linking)).toEqual({
      ok: true,
      player: { kind: "id", osuId: 9 },
      linked: true,
    });
    expect(await resolvePlayer({ discordId: "them", callerId: "me" }, linking)).toEqual({
      ok: false,
      reason: "other-unlinked",
      discordId: "them",
    });
    expect(await resolvePlayer({ name: "#", callerId: "nobody" }, linking)).toEqual({
      ok: false,
      reason: "self-unlinked",
      discordId: "nobody",
    });
  });

  it("picks the ruleset", () => {
    expect(pickRuleset("mania", "osu")).toBe("mania");
    expect(pickRuleset(null, "taiko")).toBe("taiko");
    expect(pickRuleset("std", null)).toBeUndefined();
  });
});

describe("settings", () => {
  it("reads, caches, invalidates and falls back", async () => {
    const time = clock();
    const load = vi.fn(async () => ({ guildId: GUILD, autoEmbeds: { map: false } }));
    const settings = createSettings(load, time.now);
    expect(await settings.get(null)).toBe(DM_SETTINGS);
    expect((await settings.get(GUILD)).autoEmbeds.map).toBe(false);
    await settings.get(GUILD);
    expect(load).toHaveBeenCalledTimes(1);
    settings.invalidate(GUILD);
    await settings.get(GUILD);
    expect(load).toHaveBeenCalledTimes(2);
    const broken = createSettings(async () => {
      throw new Error("down");
    });
    expect((await broken.get(GUILD)).autoEmbeds.map).toBe(true);
  });
});

describe("channel context", () => {
  it("remembers the last of each kind per channel", () => {
    const time = clock();
    const context = createChannelContext(time.now);
    context.set("c", { key: "map", beatmapId: 1 });
    context.set("c", { key: "map", beatmapId: 2 });
    context.set("c", { key: "pool", poolId: "abcdef" });
    expect(context.get("c", "map")).toEqual({ key: "map", beatmapId: 2 });
    expect(context.get("c", "pool")?.poolId).toBe("abcdef");
    expect(context.get("other", "map")).toBeNull();
    time.advance(31 * 60_000);
    expect(context.get("c", "map")).toBeNull();
  });
});

describe("channel map history", () => {
  it("keeps the last 10 maps per channel, newest first, deduped, with labels", () => {
    let t = 0;
    const context = createChannelContext(() => t);
    context.nameMap(5, "a - b [c] · 5.00★");
    for (let i = 1; i <= 12; i++) context.rememberMap("c1", i);
    context.rememberMap("c1", 5);
    const maps = context.recentMaps("c1");
    expect(maps).toHaveLength(10);
    expect(maps[0]).toEqual({ beatmapId: 5, label: "a - b [c] · 5.00★" });
    expect(maps[1]).toEqual({ beatmapId: 12, label: "Beatmap #12" });
    expect(maps.filter((m) => m.beatmapId === 5)).toHaveLength(1);
    expect(context.get("c1", "map")).toEqual({ key: "map", beatmapId: 5 });
    expect(context.recentMaps("c2")).toEqual([]);
    t = 31 * 60_000;
    expect(context.recentMaps("c1")).toEqual([]);
  });
});
