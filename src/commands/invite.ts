/**
 * @file src/commands/invite.ts
 * @desc /invite: the link to add harumin to a server, under a card image (a one-line notice
 *       when the image can't be had). Ephemeral.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Sun Oct 11, 2026
 */

import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { inviteUrl, LINKS, userInstallUrl } from "../constants.ts";
import { notice } from "../embeds/common.ts";
import { scope } from "../i18n.ts";
import type { Command } from "../types.ts";
import { imageOrEmbed, linkButtons } from "./shared.ts";

const t = scope("invite");

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
        () => notice(t("addHaruminToA", { dashboard: LINKS.dashboard })),
        linkButtons([
          { label: t("addToServer"), url: inviteUrl(s.env.DISCORD_CLIENT_ID) },
          { label: t("addToYourApps"), url: userInstallUrl(s.env.DISCORD_CLIENT_ID) },
          { label: t("dashboard"), url: LINKS.dashboard },
          { label: t("website"), url: LINKS.site },
        ]),
      ),
    );
  },
};
