/**
 * @file src/commands/osu.ts
 * @desc /osu: a player's profile in one ruleset, as a card image: animated when the cover is a
 *       gif (ffmpeg lays it under the card), else still, else the text embed.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Wed Oct 7, 2026
 */

import type { Ruleset } from "@haruhimemoe/harumin-config";
import type { OsuUserProfile } from "@haruhimemoe/osu";
import { userUrl } from "@haruhimemoe/osu/shapes";
import { SlashCommandBuilder } from "discord.js";
import { profileEmbed } from "../embeds/osu.ts";
import { isAnimatedCover } from "../services/animate.ts";
import type { Command, Services } from "../types.ts";
import { toProfileCard } from "../views/cards.ts";
import { addPlayerOptions, cardReply, linkButtons, loadPlayer } from "./shared.ts";

/**
 * @function drawProfile
 * @param s {Services} cards and the animator
 * @param profile {OsuUserProfile} the player
 * @param ruleset {Ruleset} which ruleset's numbers
 * @returns {Promise<{ file: Buffer; name: string } | null>} the gif or PNG card, or null
 */
export const drawProfile = async (
  s: Pick<Services, "cards" | "animate">,
  profile: OsuUserProfile,
  ruleset: Ruleset,
): Promise<{ file: Buffer; name: string } | null> => {
  const card = toProfileCard(profile, ruleset);
  const cover = card.player.coverUrl;
  if (isAnimatedCover(cover)) {
    const holed = await s.cards.draw("profile", { ...card, cover: "hole" });
    const gif = holed ? await s.animate.profile(holed, cover, JSON.stringify(card)) : null;
    if (gif) return { file: gif, name: "profile.gif" };
  }
  const png = await s.cards.draw("profile", card);
  return png ? { file: png, name: "profile.png" } : null;
};

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
    const drawn = await drawProfile(s, profile, ruleset);
    await interaction.editReply(
      drawn
        ? cardReply(drawn.file, drawn.name, links)
        : { embeds: [profileEmbed(profile, ruleset)], components: links },
    );
  },
};
