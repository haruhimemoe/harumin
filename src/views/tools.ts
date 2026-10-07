/**
 * @file src/views/tools.ts
 * @desc Pack and pool cards and the content check, shared by /pack, /pool and link cards. Pack
 *       keys decode locally (no request to packs); saved packs and pools come from their public
 *       routes.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { evaluateBeatmapset, factsFromOsuBeatmapset } from "@haruhimemoe/compliance";
import type { BeatmapMeta } from "@haruhimemoe/osu";
import { decodePackKey, PackKeyError } from "@haruhimemoe/pool";
import type { APIEmbed } from "discord.js";
import { LINKS } from "../constants.ts";
import { type CardSlot, type CheckRow, poolCardEmbed, poolCheckEmbed } from "../embeds/tools.ts";
import type { Services } from "../types.ts";

/** A pack or pool, however it was found. */
export type FoundPool = {
  kind: "pack" | "pool";
  name: string;
  slots: CardSlot[];
  url: string;
  subtitle?: string | undefined;
  description?: string | undefined;
};

/**
 * @function metaFor
 * @param s {Pick<Services, "osu">} osu!
 * @param slots {readonly CardSlot[]} slots
 * @returns {Promise<Map<number, BeatmapMeta>>} what osu! knows about them (empty on failure)
 */
export const metaFor = async (
  s: Pick<Services, "osu">,
  slots: readonly CardSlot[],
): Promise<Map<number, BeatmapMeta>> => {
  try {
    return (await s.osu.getBeatmaps(slots.map((slot) => slot.beatmapId))).found;
  } catch {
    return new Map();
  }
};

/**
 * @function findPackKey
 * @param key {string} a pk<version>.<data> key
 * @returns {FoundPool | null} the pool it holds, or null when it doesn't decode
 */
export const findPackKey = (key: string): FoundPool | null => {
  try {
    const pool = decodePackKey(key);
    return {
      kind: "pack",
      name: pool.name,
      slots: pool.slots,
      url: `${LINKS.packs}/k#${key}`,
      subtitle: "Pack key",
    };
  } catch (error) {
    if (error instanceof PackKeyError) return null;
    throw error;
  }
};

/**
 * @function findPack
 * @param s {Pick<Services, "apps">} the app readers
 * @param slug {string} a saved pack
 * @returns {Promise<FoundPool | null>} the pack, or null when it's missing or not public
 */
export const findPack = async (
  s: Pick<Services, "apps">,
  slug: string,
): Promise<FoundPool | null> => {
  const pack = await s.apps.getPack(slug);
  return pack
    ? {
        kind: "pack",
        name: pack.name,
        slots: pack.slots,
        url: pack.url,
        description: pack.description,
      }
    : null;
};

/**
 * @function findPool
 * @param s {Pick<Services, "apps">} the app readers
 * @param id {string} a pool id
 * @returns {Promise<FoundPool | null>} the pool, or null when it's missing or not public
 */
export const findPool = async (
  s: Pick<Services, "apps">,
  id: string,
): Promise<FoundPool | null> => {
  const pool = await s.apps.getPool(id);
  if (!pool) return null;
  const subtitle = [
    pool.tournament,
    pool.round,
    pool.year ? String(pool.year) : "",
    pool.owner ? `by ${pool.owner.username}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    kind: "pool",
    name: pool.name,
    slots: pool.slots,
    url: pool.url,
    subtitle: subtitle || undefined,
  };
};

/**
 * @function renderPoolCard
 * @param s {Pick<Services, "osu">} osu!
 * @param found {FoundPool} a pack or pool
 * @returns {Promise<APIEmbed>} its card
 */
export const renderPoolCard = async (
  s: Pick<Services, "osu">,
  found: FoundPool,
): Promise<APIEmbed> => poolCardEmbed(found, await metaFor(s, found.slots));

/**
 * @function renderPoolCheck
 * @param s {Pick<Services, "osu">} osu!
 * @param found {FoundPool} a pack or pool
 * @returns {Promise<APIEmbed>} each map against osu!'s content rules
 */
export const renderPoolCheck = async (
  s: Pick<Services, "osu">,
  found: FoundPool,
): Promise<APIEmbed> => {
  const ids = found.slots.map((slot) => slot.beatmapId);
  const [{ sets }, meta] = await Promise.all([
    s.osu.getBeatmapsets(ids, { fallbackLimit: 20 }),
    metaFor(s, found.slots),
  ]);
  const rows: CheckRow[] = found.slots.map((slot) => {
    const set = sets.get(slot.beatmapId);
    const facts = set ? factsFromOsuBeatmapset(set) : null;
    return {
      slot,
      meta: meta.get(slot.beatmapId),
      verdict: facts ? evaluateBeatmapset(facts) : null,
    };
  });
  return poolCheckEmbed(found.name, rows);
};
