/**
 * @file src/views/tools.ts
 * @desc Pack and pool cards and the content check, shared by /pack, /pool and link cards. Pack
 *       keys decode locally (no request to packs); saved packs and pools come from their public
 *       routes. Each is sent as a card image with a button to open it, or the text embed when
 *       the image can't be had.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Thu Oct 8, 2026
 */

import { evaluateBeatmapset, factsFromOsuBeatmapset } from "@haruhimemoe/compliance";
import type { BeatmapMeta } from "@haruhimemoe/osu";
import { decodePackKey, PackKeyError } from "@haruhimemoe/pool";
import { type CardMessage, imageOrEmbed, linkButtons } from "../commands/shared.ts";
import { LINKS } from "../constants.ts";
import { type CardSlot, type CheckRow, poolCardEmbed, poolCheckEmbed } from "../embeds/tools.ts";
import type { Services } from "../types.ts";
import { toPoolCard } from "./toolCards.ts";

const CONTENT_RULES_URL = "https://osu.ppy.sh/wiki/en/Rules/Content_usage_permissions";

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
 * @function openButton
 * @param found {FoundPool} a pack or pool
 * @returns {{ label: string; url: string }} the button that opens it on packs or pools
 */
const openButton = (found: FoundPool) => ({
  label: found.kind === "pack" ? "Open on packs" : "Open on pools",
  url: found.url,
});

/**
 * @function renderPoolCard
 * @param s {Pick<Services, "osu" | "cards">} osu! and the card drawer
 * @param found {FoundPool} a pack or pool
 * @returns {Promise<CardMessage>} its card
 */
export const renderPoolCard = async (
  s: Pick<Services, "osu" | "cards">,
  found: FoundPool,
): Promise<CardMessage> => {
  const meta = await metaFor(s, found.slots);
  const png = await s.cards.draw(
    "pool",
    toPoolCard({
      source: found.kind,
      name: found.name,
      subtitle: found.subtitle ?? found.description,
      slots: found.slots,
      meta,
    }),
  );
  return imageOrEmbed(
    png,
    `${found.kind}.png`,
    () => poolCardEmbed(found, meta),
    linkButtons([openButton(found)]),
  );
};

/**
 * @function checkNote
 * @param rows {readonly CheckRow[]} every map's verdict
 * @returns {string} "All 12 maps are fine." or "9 of 12 maps are fine · 2 not allowed · 1 to look at"
 */
export const checkNote = (rows: readonly CheckRow[]): string => {
  const count = (status: string | null) =>
    rows.filter((row) => (row.verdict?.status ?? null) === status).length;
  const ok = count("ok");
  if (ok === rows.length) return `All ${rows.length} maps are fine for official tournaments.`;
  return [
    `${ok} of ${rows.length} maps are fine`,
    count("disallowed") ? `${count("disallowed")} not allowed` : "",
    count("potential") ? `${count("potential")} to look at` : "",
    count(null) ? `${count(null)} couldn't be checked` : "",
  ]
    .filter(Boolean)
    .join(" · ");
};

/**
 * @function renderPoolCheck
 * @param s {Pick<Services, "osu" | "cards">} osu! and the card drawer
 * @param found {FoundPool} a pack or pool
 * @returns {Promise<CardMessage>} each map against osu!'s content rules
 */
export const renderPoolCheck = async (
  s: Pick<Services, "osu" | "cards">,
  found: FoundPool,
): Promise<CardMessage> => {
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
  const png = await s.cards.draw(
    "pool",
    toPoolCard({
      source: "check",
      name: found.name,
      subtitle: found.subtitle,
      slots: found.slots,
      meta,
      verdicts: new Map(rows.map((row) => [row.slot.beatmapId, row.verdict])),
      note: checkNote(rows),
    }),
  );
  return imageOrEmbed(
    png,
    "check.png",
    () => poolCheckEmbed(found.name, rows),
    linkButtons([openButton(found), { label: "Content rules", url: CONTENT_RULES_URL }]),
  );
};
