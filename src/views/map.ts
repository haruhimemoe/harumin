/**
 * @file src/views/map.ts
 * @desc The map card, for /map and for beatmap links: metadata from osu!, then stars, stats and
 *       pp from the .osu file with rosu (osu!'s own star rating as the fallback when the file
 *       isn't there).
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import type { OsuMod } from "@haruhimemoe/osu";
import type { APIEmbed } from "discord.js";
import { mapEmbed } from "../embeds/osu.ts";
import type { Services } from "../types.ts";
import { tryMapPp } from "./pp.ts";

/**
 * @function renderMap
 * @param s {Pick<Services, "osu" | "beatmaps">} osu! and the .osu cache
 * @param beatmapId {number} the difficulty
 * @param mods {readonly OsuMod[]} mods to show it with
 * @returns {Promise<APIEmbed | null>} the card, or null when osu! has no such map
 */
export const renderMap = async (
  s: Pick<Services, "osu" | "beatmaps">,
  beatmapId: number,
  mods: readonly OsuMod[],
): Promise<APIEmbed | null> => {
  const map = await s.osu.getBeatmap(beatmapId);
  if (!map) return null;
  const local = await tryMapPp(s, beatmapId, map.checksum, mods);
  let stars: number | null = local?.attrs.stars ?? null;
  if (stars === null && mods.length > 0) {
    stars = await s.osu
      .getStarRating(
        beatmapId,
        mods.map((mod) => mod.acronym),
      )
      .catch(() => null);
  }
  return mapEmbed(map, { mods, stars, attrs: local?.attrs ?? null, pps: local?.pps ?? null });
};
