/**
 * @file src/commands/link.ts
 * @desc /link: your link status and where to link. The accounts hub (haruhime.moe/account) owns
 *       linking: sign in with osu!, link Discord; harumin only reads it. Ephemeral.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type MessageActionRowComponentBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { linkEmbed } from "../embeds/bot.ts";
import type { Command } from "../types.ts";

export const link: Command = {
  category: "bot",
  data: new SlashCommandBuilder()
    .setName("link")
    .setDescription("Link your osu! account, or see which one is linked")
    .toJSON(),
  async execute(interaction, s) {
    const account = await s.linking.get(interaction.user.id);
    await interaction.reply({
      embeds: [linkEmbed(account, s.env.HUB_URL)],
      components: [
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setURL(`${s.env.HUB_URL}/account`)
            .setLabel(account ? "Manage on haruhime.moe" : "Link on haruhime.moe"),
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};
