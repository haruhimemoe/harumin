/**
 * @file tests/services/stores.test.ts
 * @desc The MongoDB stores against an in-memory server: members (sightings, batching, lookups),
 *       linking's identity queries, guild settings loading, and /track (add, move, cap, remove,
 *       list, the first look that only records, new plays posted to every channel).
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { MAX_TRACKED_PER_GUILD } from "@haruhimemoe/harumin-config";
import { type Db, MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { identityBatchLookup, identityLookup } from "../../src/services/linking.ts";
import { createMembers } from "../../src/services/members.ts";
import { createSettings, mongoSettingsLoader } from "../../src/services/settings.ts";
import { createTracks, newTopPlays, roundIntervalMs } from "../../src/services/tracks.ts";
import { clock, makeScore } from "../helpers.ts";

const GUILD = "123456789012345678";
const OTHER = "223456789012345678";
const CHANNEL = "323456789012345678";
const USER = "423456789012345678";

let server: MongoMemoryServer;
let client: MongoClient;
let db: Db;

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  client = await MongoClient.connect(server.getUri());
}, 60_000);
afterAll(async () => {
  await client?.close();
  await server?.stop();
});
beforeEach(async () => {
  db = client.db(`t${Math.random().toString(36).slice(2)}`);
});

describe("members", () => {
  it("records sightings once a day, in batches", async () => {
    const time = clock(Date.parse("2026-10-06T00:00:00Z"));
    const members = createMembers(db, time.now);
    await members.flush();
    members.seen(GUILD, USER);
    members.seen(GUILD, USER);
    members.seen(OTHER, USER);
    await members.flush();
    expect(await members.inGuild(GUILD)).toEqual([USER]);
    expect((await members.guildsOf(USER)).sort()).toEqual([GUILD, OTHER]);
    time.advance(100 * 86_400_000);
    expect(await members.inGuild(GUILD)).toEqual([]);
    members.seen(GUILD, USER);
    await members.flush();
    expect(await members.inGuild(GUILD)).toEqual([USER]);
  });
});

describe("identity reads", () => {
  it("finds linked, unbanned users", async () => {
    await db.collection("user").insertMany([
      { discordId: USER, osuId: 2, username: "peppy" },
      { discordId: GUILD, osuId: 3, username: "banned", bannedAt: new Date() },
      { discordId: OTHER, username: "no osu" },
    ]);
    const one = identityLookup(db);
    expect(await one(USER)).toEqual({ osuId: 2, username: "peppy" });
    expect(await one(GUILD)).toBeNull();
    expect(await one(OTHER)).toBeNull();
    expect(await one("not-an-id")).toBeNull();
    const many = await identityBatchLookup(db)([USER, GUILD, OTHER, "bad"]);
    expect([...many.keys()]).toEqual([USER]);
    expect((await identityBatchLookup(db)(["bad"])).size).toBe(0);
  });
});

describe("settings loader", () => {
  it("reads guild_settings", async () => {
    await db.collection("guild_settings").insertOne({ guildId: GUILD, defaultMode: "taiko" });
    const settings = createSettings(mongoSettingsLoader(db));
    expect((await settings.get(GUILD)).defaultMode).toBe("taiko");
    expect((await settings.get(OTHER)).defaultMode).toBeNull();
  });
});

describe("tracks", () => {
  it("diffs top plays and sizes rounds", () => {
    const scores = [makeScore({ id: 1 }), makeScore({ id: 2 }), makeScore({ id: 3 })];
    expect(newTopPlays(null, scores)).toEqual([]);
    expect(newTopPlays([1, 3], scores)).toEqual([{ score: scores[1], place: 2 }]);
    expect(roundIntervalMs(10, 120)).toBe(120_000);
    expect(roundIntervalMs(600, 120)).toBe(600_000);
  });

  it("stores entries with a cap", async () => {
    const tracks = createTracks(db, { getUserScores: async () => [] }, { perMinute: 120 });
    const entry = {
      guildId: GUILD,
      channelId: CHANNEL,
      osuId: 2,
      username: "peppy",
      mode: "osu" as const,
      addedBy: USER,
      addedAt: new Date(),
    };
    expect(await tracks.add(entry)).toBe("added");
    expect(await tracks.add(entry)).toBe("exists");
    expect(await tracks.add({ ...entry, channelId: OTHER })).toBe("added");
    expect((await tracks.list(GUILD))[0]?.channelId).toBe(OTHER);
    for (let id = 10; id < 10 + MAX_TRACKED_PER_GUILD - 1; id++)
      await tracks.add({ ...entry, osuId: id });
    expect(await tracks.add({ ...entry, osuId: 999 })).toBe("full");
    expect(await tracks.remove(GUILD, 2, "osu")).toBe(true);
    expect(await tracks.remove(GUILD, 2, "osu")).toBe(false);
  });

  it("records on the first look, then posts new plays to every channel", async () => {
    let top = [makeScore({ id: 1 }), makeScore({ id: 2 })];
    const getUserScores = vi.fn(async (osuId: number) => {
      if (osuId === 666) throw new Error("osu! down");
      return top;
    });
    const log = vi.fn();
    const tracks = createTracks(db, { getUserScores }, { perMinute: 120, log });
    const entry = {
      guildId: GUILD,
      channelId: CHANNEL,
      osuId: 2,
      username: "peppy",
      mode: "osu" as const,
      addedBy: USER,
      addedAt: new Date(),
    };
    await tracks.add(entry);
    await tracks.add({ ...entry, guildId: OTHER, channelId: OTHER });
    await tracks.add({ ...entry, osuId: 666 });
    const posted: [string, number, number][] = [];
    tracks.start(async (channelId, score, place) => {
      posted.push([channelId, score.id, place]);
    });
    tracks.stop();
    expect(await tracks.round()).toBe(0);
    top = [makeScore({ id: 9 }), ...top];
    expect(await tracks.round()).toBe(2);
    expect(posted.sort()).toEqual([
      [OTHER, 9, 1],
      [CHANNEL, 9, 1],
    ]);
    expect(getUserScores).toHaveBeenCalledWith(2, "best", { ruleset: "osu", limit: 100 });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("666"), expect.any(Error));
  });
});
