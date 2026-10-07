/**
 * @file src/commands/info.ts
 * @desc /info: version, server count, uptime, ping and links.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { SlashCommandBuilder } from "discord.js";
import { infoEmbed } from "../embeds/bot.ts";
import type { Command } from "../types.ts";

export const info: Command = {
  category: "bot",
  data: new SlashCommandBuilder().setName("info").setDescription("About harumin").toJSON(),
  async execute(interaction, s) {
    await interaction.reply({
      embeds: [
        infoEmbed({
          guilds: interaction.client.guilds.cache.size,
          uptimeMs: Date.now() - s.startedAt,
          pingMs: Math.max(0, interaction.client.ws.ping),
        }),
      ],
    });
  },
};
