/**
 * @file src/commands/help.ts
 * @desc /help: every command, or one in detail. Built from the same definitions harumin registers,
 *       so it can't drift.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { commandHelpEmbed, helpEmbed } from "../embeds/bot.ts";
import type { Command } from "../types.ts";
import { fail } from "./shared.ts";

export const help: Command = {
  category: "bot",
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("What harumin can do")
    .addStringOption((option) =>
      option.setName("command").setDescription("One command in detail").setMaxLength(32),
    )
    .toJSON(),
  async execute(interaction) {
    // Imported here: the registry imports this file.
    const { publicCommands } = await import("../registry.ts");
    const name = interaction.options.getString("command")?.replace(/^\//, "").trim().toLowerCase();
    if (!name) {
      await interaction.reply({
        embeds: [helpEmbed(publicCommands())],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const command = publicCommands().find((each) => each.data.name === name);
    if (!command) {
      await fail(interaction, `There's no \`/${name}\`. Run \`/help\` for the list.`);
      return;
    }
    await interaction.reply({ embeds: [commandHelpEmbed(command)], flags: MessageFlags.Ephemeral });
  },
};
