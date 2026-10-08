/**
 * @file src/commands/invite.ts
 * @desc /invite: the link to add harumin to a server, under a card image (a one-line notice
 *       when the image can't be had). Ephemeral.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Thu Oct 8, 2026
 */

import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { inviteUrl, LINKS } from "../constants.ts";
import { notice } from "../embeds/common.ts";
import type { Command } from "../types.ts";
import { imageOrEmbed, linkButtons } from "./shared.ts";

export const invite: Command = {
  category: "bot",
  data: new SlashCommandBuilder()
    .setName("invite")
    .setDescription("Add harumin to your server")
    .toJSON(),
  async execute(interaction, s) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const png = await s.cards.draw("invite", { guilds: interaction.client.guilds.cache.size });
    await interaction.editReply(
      imageOrEmbed(
        png,
        "invite.png",
        () =>
          notice(
            `Add harumin to a server you manage. Settings live on the [dashboard](${LINKS.dashboard}).`,
          ),
        linkButtons([
          { label: "Add to server", url: inviteUrl(s.env.DISCORD_CLIENT_ID) },
          { label: "Dashboard", url: LINKS.dashboard },
          { label: "Website", url: LINKS.site },
        ]),
      ),
    );
  },
};
