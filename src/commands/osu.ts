/**
 * @file src/commands/osu.ts
 * @desc /osu: a player's profile in one ruleset, as a card image (the text embed when the image
 *       can't be had).
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Wed Oct 7, 2026
 */

import { userUrl } from "@haruhimemoe/osu/shapes";
import { SlashCommandBuilder } from "discord.js";
import { profileEmbed } from "../embeds/osu.ts";
import type { Command } from "../types.ts";
import { toProfileCard } from "../views/cards.ts";
import { addPlayerOptions, cardReply, linkButtons, loadPlayer } from "./shared.ts";

export const osu: Command = {
  category: "osu",
  data: addPlayerOptions(
    new SlashCommandBuilder().setName("osu").setDescription("A player's osu! profile"),
  ).toJSON(),
  async execute(interaction, s) {
    await interaction.deferReply();
    const loaded = await loadPlayer(interaction, s);
    if (!loaded) return;
    const { profile, ruleset } = loaded;
    const links = linkButtons([
      { label: "osu! profile", url: `${userUrl(profile.osuId)}/${ruleset}` },
    ]);
    const png = await s.cards.draw("profile", toProfileCard(profile, ruleset));
    await interaction.editReply(
      png
        ? cardReply(png, "profile.png", links)
        : { embeds: [profileEmbed(profile, ruleset)], components: links },
    );
  },
};
