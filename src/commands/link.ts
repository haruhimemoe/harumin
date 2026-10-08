/**
 * @file src/commands/link.ts
 * @desc /link: your link status and where to link, as a card image (the text embed when the
 *       image can't be had). The accounts hub (haruhime.moe/account) owns linking: sign in with
 *       osu!, link Discord; harumin only reads it. Ephemeral.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Thu Oct 8, 2026
 */

import { userUrl } from "@haruhimemoe/osu/shapes";
import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { linkEmbed } from "../embeds/bot.ts";
import type { Command } from "../types.ts";
import { imageOrEmbed, linkButtons } from "./shared.ts";

export const link: Command = {
  category: "bot",
  data: new SlashCommandBuilder()
    .setName("link")
    .setDescription("Link your osu! account, or see which one is linked")
    .toJSON(),
  async execute(interaction, s) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const account = await s.linking.get(interaction.user.id);
    const png = await s.cards.draw("link", {
      account: account ? { osuId: account.osuId, username: account.username } : null,
    });
    await interaction.editReply(
      imageOrEmbed(
        png,
        "link.png",
        () => linkEmbed(account, s.env.HUB_URL),
        linkButtons([
          {
            label: account ? "Manage on haruhime.moe" : "Link on haruhime.moe",
            url: `${s.env.HUB_URL}/account`,
          },
          ...(account ? [{ label: "osu! profile", url: userUrl(account.osuId) }] : []),
        ]),
      ),
    );
  },
};
