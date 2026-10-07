/**
 * @file src/commands/osu.ts
 * @desc /osu: a player's profile in one ruleset.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { SlashCommandBuilder } from "discord.js";
import { profileEmbed } from "../embeds/osu.ts";
import type { Command } from "../types.ts";
import { addPlayerOptions, loadPlayer } from "./shared.ts";

export const osu: Command = {
  category: "osu",
  data: addPlayerOptions(
    new SlashCommandBuilder().setName("osu").setDescription("A player's osu! profile"),
  ).toJSON(),
  async execute(interaction, s) {
    await interaction.deferReply();
    const loaded = await loadPlayer(interaction, s);
    if (!loaded) return;
    await interaction.editReply({ embeds: [profileEmbed(loaded.profile, loaded.ruleset)] });
  },
};
