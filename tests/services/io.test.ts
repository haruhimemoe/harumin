/**
 * @file tests/services/io.test.ts
 * @desc Services that talk to something: the dashboard's service routes, the packs and pools
 *       readers, the .osu file cache, the osu! client binding, env parsing and failure texts.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { OsuApiError } from "@haruhimemoe/osu";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadEnv } from "../../src/env.ts";
import { failureText } from "../../src/router.ts";
import { bearerMatches, createServiceHandler } from "../../src/service/handler.ts";
import { createApps } from "../../src/services/apps.ts";
import { createBeatmapFiles } from "../../src/services/beatmap-files.ts";
import { createBudget } from "../../src/services/budget.ts";
import { bindBudget } from "../../src/services/osu.ts";

const TOKEN = "t".repeat(40);
const GUILD = "123456789012345678";

describe("service routes", () => {
  const revalidate = vi.fn();
  const revalidateUser = vi.fn();
  const handler = createServiceHandler({
    revalidateUser,
    token: TOKEN,
    manageableGuilds: async (id) => (id === GUILD ? [{ id: GUILD, name: "osu!", icon: null }] : []),
    guildChannels: async (id) => (id === GUILD ? [{ id: GUILD, name: "general" }] : null),
    revalidate,
  });
  const call = (pathAndQuery: string, init: RequestInit = {}, auth = `Bearer ${TOKEN}`) =>
    handler(
      new Request(`http://bot${pathAndQuery}`, { ...init, headers: { authorization: auth } }),
    );

  it("checks the bearer", async () => {
    expect(bearerMatches(`Bearer ${TOKEN}`, TOKEN)).toBe(true);
    expect(bearerMatches(`Bearer ${TOKEN}x`, TOKEN)).toBe(false);
    expect(bearerMatches(null, TOKEN)).toBe(false);
    expect((await call("/guilds/manageable", {}, "Bearer nope")).status).toBe(401);
    expect((await call("/health", {}, "")).status).toBe(200);
  });

  it("answers the dashboard's questions", async () => {
    expect(await (await call(`/guilds/manageable?discordId=${GUILD}`)).json()).toEqual({
      guilds: [{ id: GUILD, name: "osu!", icon: null }],
    });
    expect((await call("/guilds/manageable?discordId=abc")).status).toBe(400);
    expect(await (await call(`/guilds/${GUILD}/channels`)).json()).toEqual({
      channels: [{ id: GUILD, name: "general" }],
    });
    expect((await call("/guilds/876543210987654321/channels")).status).toBe(404);
    const ok = await call("/settings/revalidate", {
      method: "POST",
      body: JSON.stringify({ guildId: GUILD }),
    });
    expect(ok.status).toBe(204);
    expect(revalidate).toHaveBeenCalledWith(GUILD);
    expect((await call("/settings/revalidate", { method: "POST", body: "nope" })).status).toBe(400);
    expect((await call("/nope")).status).toBe(404);
  });

  it("drops a player's cached card settings", async () => {
    const ok = await call("/users/revalidate", {
      method: "POST",
      body: JSON.stringify({ osuId: 2 }),
    });
    expect(ok.status).toBe(204);
    expect(revalidateUser).toHaveBeenCalledWith(2);
    expect((await call("/users/revalidate", { method: "POST", body: "{}" })).status).toBe(400);
    const noAuth = await call("/users/revalidate", { method: "POST", body: "{}" }, "");
    expect(noAuth.status).toBe(401);
  });
});

describe("apps", () => {
  const pack = {
    pack: { slug: "AbCdEfGhIj", name: "Pack", slots: [{ mod: "NM", index: 1, beatmapId: 75 }] },
  };
  const pool = { pool: { id: "abcdef", name: "Pool", slots: [], buckets: [], tournament: "OWC" } };
  const fetch = vi.fn(async (url: string) => {
    if (url.endsWith("/api/packs/AbCdEfGhIj")) return Response.json(pack);
    if (url.endsWith("/api/pools/abcdef")) return Response.json(pool);
    if (url.endsWith("/api/pools/broken")) return new Response("x", { status: 500 });
    return new Response(null, { status: 404 });
  });
  const apps = createApps({ fetch });

  it("reads packs and pools, caches, and reads 404 as null", async () => {
    expect(await apps.getPack("AbCdEfGhIj")).toMatchObject({
      name: "Pack",
      url: "https://packs.haruhime.moe/p/AbCdEfGhIj",
    });
    await apps.getPack("AbCdEfGhIj");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await apps.getPool("abcdef")).toMatchObject({
      name: "Pool",
      tournament: "OWC",
      owner: null,
      url: "https://pools.haruhime.moe/pools/abcdef",
    });
    expect(await apps.getPack("missing123")).toBeNull();
    expect(await apps.getPool("missing")).toBeNull();
    expect(await apps.getPool("missing")).toBeNull();
    await expect(apps.getPool("broken")).rejects.toThrow("answered 500");
  });
});

describe("beatmap files", () => {
  let dir = "";
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("downloads, checks the MD5, caches, shares in-flight work and prunes", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "harumin-"));
    const body = new TextEncoder().encode("osu file format v14\n");
    const md5 = createHash("md5").update(body).digest("hex");
    const fetch = vi.fn(async (url: string) =>
      url.endsWith("/404") ? new Response(null, { status: 404 }) : new Response(body),
    );
    const files = createBeatmapFiles({ dir, fetch, maxFiles: 2 });
    const [a, b] = await Promise.all([files.get(1, md5), files.get(1, md5)]);
    expect(a).toEqual(body);
    expect(b).toEqual(body);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await files.get(1, md5)).toEqual(body);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await files.get(2, "0".repeat(32))).toBeNull();
    expect(await files.get(404)).toBeNull();
    for (let id = 10; id < 40; id++) await files.get(id);
    expect((await readdir(dir)).filter((name) => name.endsWith(".osu")).length).toBeLessThanOrEqual(
      8,
    );
  });

  it("stops when the budget says no, and refetches a stale cache", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "harumin-"));
    await writeFile(path.join(dir, "5.osu"), "old");
    const fetch = vi.fn(async () => new Response("new"));
    expect(
      await createBeatmapFiles({ dir, fetch, beforeFetch: async () => false }).get(
        5,
        "f".repeat(32),
      ),
    ).toBeNull();
    expect(await createBeatmapFiles({ dir, fetch }).get(5)).toEqual(
      new TextEncoder().encode("old"),
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("osu binding", () => {
  it("passes the budget into every call", async () => {
    const budget = createBudget({ perMinute: 60_000, burst: 20 });
    const seen: unknown[] = [];
    const fake = new Proxy(
      {},
      {
        get:
          () =>
          async (...args: unknown[]) => {
            const options = args.at(-1) as { beforeCall: () => Promise<boolean> };
            seen.push(await options.beforeCall());
            return null;
          },
      },
    );
    // biome-ignore lint/suspicious/noExplicitAny: a stand-in client
    const osu = bindBudget(fake as any, budget);
    await osu.getUserProfile(2);
    await osu.getUserScores(2, "best");
    expect(seen[0]).toBe(true);
    await osu.getBeatmapUserScores(1, 2);
    await osu.getBeatmapScores(1);
    await osu.getBeatmap(1);
    await osu.getBeatmaps([1]);
    await osu.getBeatmapsets([1]);
    await osu.getStarRating(1, []);
    await osu.getMatch(1);
    await osu.getUsers([1]);
    expect(seen).toHaveLength(10);
  });
});

describe("env and failures", () => {
  const good = {
    DISCORD_TOKEN: "x",
    DISCORD_CLIENT_ID: GUILD,
    DEV_GUILD_ID: GUILD,
    OWNER_ID: GUILD,
    OSU_CLIENT_ID: "1",
    OSU_CLIENT_SECRET: "s",
    MONGODB_URI: "mongodb://localhost/harumin",
    IDENTITY_MONGODB_URI: "mongodb://localhost/identity",
    HARUMIN_SERVICE_TOKEN: TOKEN,
    TOPGG_TOKEN: " ",
  };

  it("parses env and names bad variables without values", () => {
    const env = loadEnv(good);
    expect(env.OSU_RATE_PER_MINUTE).toBe(120);
    expect(env.TOPGG_TOKEN).toBeUndefined();
    expect(() => loadEnv({ ...good, HARUMIN_SERVICE_TOKEN: "short", OWNER_ID: "me" })).toThrow(
      "harumin: missing or invalid env: OWNER_ID, HARUMIN_SERVICE_TOKEN",
    );
  });

  it("explains failures", () => {
    expect(failureText(new OsuApiError("budget", "x"))).toContain("busy");
    expect(failureText(new OsuApiError("http_error", "x", { status: 429 }))).toContain(
      "rate limiting",
    );
    expect(failureText(new OsuApiError("http_error", "x", { status: 503 }))).toContain(
      "isn't answering",
    );
    expect(failureText(new OsuApiError("timeout", "x"))).toContain("isn't answering");
    expect(failureText(new Error("x"))).toContain("logged");
  });
});
