/**
 * @file src/commands/map.ts
 * @desc /map: a map card image with stars, stats and pp at 95 to 100% for the given mods.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Wed Oct 7, 2026
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
    const reply = await renderMap(s, beatmapId, mods);
    if (!reply) {
      await fail(interaction, "osu! has no beatmap with that id.");
      return;
    }
    s.context.rememberMap(interaction.channelId, beatmapId);
    await interaction.editReply(reply);
  },
};
