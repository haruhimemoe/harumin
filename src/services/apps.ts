/**
 * @file src/services/apps.ts
 * @desc Reading the other haruhime apps through their public routes, never their databases:
 *       a pack from packs.haruhime.moe (GET /api/packs/{slug}) and a pool from pools.haruhime.moe
 *       (GET /api/pools/{id}). /practice asks pools' internal similar-maps route with a bearer secret
 *       (never cached here; the command caches its pick). Only what anyone signed out may see comes back; private and hidden
 *       ones answer 404 and read as null. Answers are cached for two minutes.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { z } from "zod";
import { USER_AGENT } from "../constants.ts";
import { createTtlCache } from "./cache.ts";

const slotSchema = z.object({
  mod: z.string().nullable(),
  index: z.number().int(),
  beatmapId: z.number().int().positive(),
});

const bucketSchema = z.object({ code: z.string(), name: z.string().optional() }).loose();

const packSchema = z.object({
  pack: z.object({
    slug: z.string(),
    name: z.string(),
    description: z.string().optional(),
    slots: z.array(slotSchema),
    buckets: z.array(bucketSchema).optional(),
    updatedAt: z.string().optional(),
  }),
});

const similarSchema = z.object({
  sets: z.array(
    z.object({
      artist: z.string(),
      title: z.string(),
      diffs: z.array(
        z.object({
          id: z.number().int().positive(),
          version: z.string(),
          stars: z.number(),
          length: z.number(),
          similarity: z.number(),
        }),
      ),
    }),
  ),
});

const poolSchema = z.object({
  pool: z.object({
    id: z.string(),
    name: z.string(),
    tournament: z.string().default(""),
    round: z.string().default(""),
    year: z.number().nullable().default(null),
    owner: z.object({ osuId: z.number(), username: z.string() }).nullable().default(null),
    slots: z.array(slotSchema),
    buckets: z.array(bucketSchema).default([]),
  }),
});

/** One slot as packs and pools send it. */
export type AppSlot = z.infer<typeof slotSchema>;
/** A pack as packs.haruhime.moe sends it. */
export type AppPack = z.infer<typeof packSchema>["pack"] & { url: string };
/** A pool as pools.haruhime.moe sends it. */
export type AppPool = z.infer<typeof poolSchema>["pool"] & { url: string };

/** A map pools offered as like a seed (the picker's Candidate). */
export type SimilarMap = {
  beatmapId: number;
  title: string;
  stars: number;
  lengthSeconds: number;
  similarity: number;
};

/** What /practice asks pools for: a lens and a star range. */
export type SimilarQuery = { mods: "NM" | "HD" | "HR" | "DT"; min: number; max: number };

/** The readers. */
export type Apps = {
  getPack: (slug: string) => Promise<AppPack | null>;
  /** Maps like a seed, from pools' internal route; null when unset or unavailable. */
  similar: (beatmapId: number, query: SimilarQuery) => Promise<SimilarMap[] | null>;
  getPool: (id: string) => Promise<AppPool | null>;
};

/** createApps' options. */
export type AppsOptions = {
  packsUrl?: string;
  poolsUrl?: string;
  /** pools' HARUMIN_SERVICE_SECRET (the bot's POOLS_SERVICE_SECRET); similar() is null without it. */
  poolsSecret?: string;
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
  now?: () => number;
};

/**
 * @function createApps
 * @param options {AppsOptions} base URLs, fetch and clock (tests)
 * @returns {Apps} cached readers; a network failure or unreadable answer throws, 404 is null
 */
export const createApps = ({
  packsUrl = "https://packs.haruhime.moe",
  poolsUrl = "https://pools.haruhime.moe",
  poolsSecret,
  fetch = globalThis.fetch,
  now = Date.now,
}: AppsOptions = {}): Apps => {
  const cache = createTtlCache<string, AppPack | AppPool | null>(120_000, 2_000, now);

  const read = async <T>(url: string, schema: z.ZodType<T>): Promise<T | null> => {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`${new URL(url).host} answered ${response.status}`);
    return schema.parse(await response.json());
  };

  return {
    async getPack(slug) {
      const key = `pack:${slug}`;
      const hit = cache.get(key);
      if (hit !== undefined) return hit as AppPack | null;
      const body = await read(`${packsUrl}/api/packs/${encodeURIComponent(slug)}`, packSchema);
      const pack = body ? { ...body.pack, url: `${packsUrl}/p/${body.pack.slug}` } : null;
      cache.set(key, pack);
      return pack;
    },
    async getPool(id) {
      const key = `pool:${id}`;
      const hit = cache.get(key);
      if (hit !== undefined) return hit as AppPool | null;
      const body = await read(`${poolsUrl}/api/pools/${encodeURIComponent(id)}`, poolSchema);
      const pool = body ? { ...body.pool, url: `${poolsUrl}/pools/${body.pool.id}` } : null;
      cache.set(key, pool);
      return pool;
    },
    async similar(beatmapId, { mods, min, max }) {
      if (!poolsSecret) return null;
      const round = (n: number) => String(Math.round(n * 100) / 100);
      const query = new URLSearchParams({
        mods,
        sr: `${round(min)}-${round(max)}`,
        status: "leaderboard",
      });
      try {
        const response = await fetch(`${poolsUrl}/api/internal/similar/${beatmapId}?${query}`, {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${poolsSecret}`,
            "User-Agent": USER_AGENT,
          },
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) return null;
        const body = similarSchema.parse(await response.json());
        return body.sets.flatMap((set) =>
          set.diffs.map((diff) => ({
            beatmapId: diff.id,
            title: `${set.artist} - ${set.title} [${diff.version}]`,
            stars: diff.stars,
            lengthSeconds: diff.length,
            similarity: diff.similarity,
          })),
        );
      } catch {
        return null;
      }
    },
  };
};
