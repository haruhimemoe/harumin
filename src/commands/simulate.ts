/**
 * @file src/commands/simulate.ts
 * @desc /simulate: pp for a made-up score on a map: accuracy, combo, misses and mods.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { formatMods } from "@haruhimemoe/osu/format";
import { SlashCommandBuilder } from "discord.js";
import { simulateEmbed } from "../embeds/osu.ts";
import { simulate as simulatePp } from "../services/pp.ts";
import type { Command } from "../types.ts";
import { parseModsInput } from "../utils/mods.ts";
import { addMapOption, fail, mapFromOption } from "./shared.ts";

export const simulate: Command = {
  category: "osu",
  data: addMapOption(
    new SlashCommandBuilder().setName("simulate").setDescription("pp for a score you describe"),
  )
    .addNumberOption((option) =>
      option
        .setName("accuracy")
        .setDescription("Percent, e.g. 98.5")
        .setMinValue(0)
        .setMaxValue(100),
    )
    .addIntegerOption((option) =>
      option.setName("combo").setDescription("Max combo").setMinValue(0),
    )
    .addIntegerOption((option) => option.setName("misses").setDescription("Misses").setMinValue(0))
    .addStringOption((option) =>
      option.setName("mods").setDescription("Mods, e.g. HDDT").setMaxLength(24),
    )
    .toJSON(),
  async execute(interaction, s) {
    const mods = parseModsInput(interaction.options.getString("mods") ?? "");
    if (mods === null) {
      await fail(interaction, "That isn't a mod combination. Try `HDDT`.");
      return;
    }
    const beatmapId = await mapFromOption(interaction, s);
    if (!beatmapId) return;
    await interaction.deferReply();
    const map = await s.osu.getBeatmap(beatmapId);
    if (!map) {
      await fail(interaction, "osu! has no beatmap with that id.");
      return;
    }
    const bytes = await s.beatmaps.get(beatmapId, map.checksum);
    if (!bytes) {
      await fail(
        interaction,
        "Couldn't get that map's file from osu! right now. Try again in a minute.",
      );
      return;
    }
    const input = {
      mods: formatMods(mods),
      accuracy: interaction.options.getNumber("accuracy") ?? undefined,
      combo: interaction.options.getInteger("combo") ?? undefined,
      misses: interaction.options.getInteger("misses") ?? undefined,
    };
    const result = simulatePp(bytes, {
      mods,
      accuracy: input.accuracy,
      combo: input.combo,
      misses: input.misses,
    });
    s.context.set(interaction.channelId, { key: "map", beatmapId });
    await interaction.editReply({ embeds: [simulateEmbed(map, result, input)] });
  },
};
