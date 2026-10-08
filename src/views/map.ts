/**
 * @file src/views/map.ts
 * @desc The map card, for /map and for beatmap links: metadata from osu!, then stars, stats and
 *       pp from the .osu file with rosu (osu!'s own star rating as the fallback when the file
 *       isn't there). Sent as a card image with a Beatmap button, or the text embed when the
 *       image can't be had.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Wed Oct 7, 2026
 */

import type { OsuMod } from "@haruhimemoe/osu";
import { beatmapUrl } from "@haruhimemoe/osu/shapes";
import type { ActionRowBuilder, APIEmbed, MessageActionRowComponentBuilder } from "discord.js";
import { linkButtons } from "../commands/shared.ts";
import { mapEmbed } from "../embeds/osu.ts";
import type { Services } from "../types.ts";
import { mapLabel } from "../utils/format.ts";
import { toMapCard } from "./cards.ts";
import { tryMapPp } from "./pp.ts";

/** A map reply: the image and its button, or the embed and its button. */
export type MapReply = {
  embeds: APIEmbed[];
  files: { attachment: Buffer; name: string }[];
  components: ActionRowBuilder<MessageActionRowComponentBuilder>[];
};

/**
 * @function renderMap
 * @param s {Pick<Services, "osu" | "beatmaps" | "cards">} osu!, the .osu cache and the card drawer
 * @param beatmapId {number} the difficulty
 * @param mods {readonly OsuMod[]} mods to show it with
 * @returns {Promise<MapReply | null>} the card, or null when osu! has no such map
 */
export const renderMap = async (
  s: Pick<Services, "osu" | "beatmaps" | "cards" | "context">,
  beatmapId: number,
  mods: readonly OsuMod[],
): Promise<MapReply | null> => {
  const map = await s.osu.getBeatmap(beatmapId);
  if (!map) return null;
  s.context.nameMap(beatmapId, mapLabel(map));
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
  const data = { mods, stars, attrs: local?.attrs ?? null, pps: local?.pps ?? null };
  const components = linkButtons([{ label: "Beatmap", url: beatmapUrl(beatmapId) }]);
  const png = await s.cards.draw("map", toMapCard(map, data));
  return png
    ? { embeds: [], files: [{ attachment: png, name: "map.png" }], components }
    : { embeds: [mapEmbed(map, data)], files: [], components };
};
