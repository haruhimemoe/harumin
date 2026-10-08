/**
 * @file src/commands/info.ts
 * @desc /info: version, server count, uptime and ping as a card image, with the links as
 *       buttons. The text embed goes out when the image can't be had.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Thu Oct 8, 2026
 */

import { SlashCommandBuilder } from "discord.js";
import { LINKS, VERSION } from "../constants.ts";
import { infoEmbed } from "../embeds/bot.ts";
import type { Command } from "../types.ts";
import { imageOrEmbed, linkButtons } from "./shared.ts";

export const info: Command = {
  category: "bot",
  data: new SlashCommandBuilder().setName("info").setDescription("About harumin").toJSON(),
  async execute(interaction, s) {
    await interaction.deferReply();
    const stats = {
      guilds: interaction.client.guilds.cache.size,
      uptimeMs: Date.now() - s.startedAt,
      pingMs: Math.max(0, Math.round(interaction.client.ws.ping)),
    };
    const png = await s.cards.draw("info", {
      version: VERSION,
      guilds: stats.guilds,
      uptimeSeconds: Math.floor(stats.uptimeMs / 1000),
      pingMs: stats.pingMs,
    });
    await interaction.editReply(
      imageOrEmbed(
        png,
        "info.png",
        () => infoEmbed(stats),
        png
          ? linkButtons([
              { label: "Website", url: LINKS.site },
              { label: "Commands", url: LINKS.commands },
              { label: "Dashboard", url: LINKS.dashboard },
              { label: "Support", url: LINKS.support },
              { label: "Source", url: LINKS.source },
            ])
          : [],
      ),
    );
  },
};
