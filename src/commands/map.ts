/**
 * @file src/commands/map.ts
 * @desc /map: a map card with stars, stats and pp at 95 to 100% for the given mods.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types.ts";
import { parseModsInput } from "../utils/mods.ts";
import { renderMap } from "../views/map.ts";
import { addMapOption, fail, mapFromOption } from "./shared.ts";

export const map: Command = {
  category: "osu",
  data: addMapOption(
    new SlashCommandBuilder().setName("map").setDescription("A beatmap's stats and pp"),
  )
    .addStringOption((option) =>
      option.setName("mods").setDescription("Mods, e.g. HDDT").setMaxLength(24),
    )
    .toJSON(),
  async execute(interaction, s) {
    const mods = parseModsInput(interaction.options.getString("mods") ?? "");
    if (mods === null) {
      await fail(interaction, "That isn't a mod combination. Try `HDDT` or `HR`.");
      return;
    }
    const beatmapId = await mapFromOption(interaction, s);
    if (!beatmapId) return;
    await interaction.deferReply();
    const embed = await renderMap(s, beatmapId, mods);
    if (!embed) {
      await fail(interaction, "osu! has no beatmap with that id.");
      return;
    }
    s.context.set(interaction.channelId, { key: "map", beatmapId });
    await interaction.editReply({ embeds: [embed] });
  },
};
