/**
 * @file src/commands/invite.ts
 * @desc /invite: the link to add harumin to a server.
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
import { inviteUrl, LINKS } from "../constants.ts";
import { notice } from "../embeds/common.ts";
import type { Command } from "../types.ts";

export const invite: Command = {
  category: "bot",
  data: new SlashCommandBuilder()
    .setName("invite")
    .setDescription("Add harumin to your server")
    .toJSON(),
  async execute(interaction, s) {
    await interaction.reply({
      embeds: [
        notice(
          `Add harumin to a server you manage. Settings live on the [dashboard](${LINKS.dashboard}).`,
        ),
      ],
      components: [
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setURL(inviteUrl(s.env.DISCORD_CLIENT_ID))
            .setLabel("Add to server"),
          new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(LINKS.site).setLabel("Website"),
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};
