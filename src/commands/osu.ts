/**
 * @file src/commands/osu.ts
 * @desc /osu: a player's profile in one ruleset, as a card image: animated when the cover is a
 *       gif (ffmpeg lays it under the card), else still, else the text embed.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Thu Oct 8, 2026
 */

import type { Ruleset } from "@haruhimemoe/harumin-config";
import type { OsuUserProfile } from "@haruhimemoe/osu";
import { userUrl } from "@haruhimemoe/osu/shapes";
import { SlashCommandBuilder } from "discord.js";
import { profileEmbed } from "../embeds/osu.ts";
import { isAnimatedCover } from "../services/animate.ts";
import type { Command, Services } from "../types.ts";
import { favoriteLine } from "../views/best.ts";
import { toProfileCard } from "../views/cards.ts";
import { addPlayerOptions, cardReply, linkButtons, loadPlayer } from "./shared.ts";

/**
 * @function drawProfile
 * @param s {Services} cards, the animator, osu! and card settings (accent, cover, favorite)
 * @param profile {OsuUserProfile} the player
 * @param ruleset {Ruleset} which ruleset's numbers
 * @returns {Promise<{ file: Buffer; name: string } | null>} the gif or PNG card, or null
 */
export const drawProfile = async (
  s: Pick<Services, "cards" | "animate" | "osu" | "userSettings">,
  profile: OsuUserProfile,
  ruleset: Ruleset,
): Promise<{ file: Buffer; name: string } | null> => {
  const settings = await s.userSettings.get(profile.osuId);
  const favorite = settings.favoriteBeatmapId
    ? await favoriteLine(s, profile.osuId, settings.favoriteBeatmapId, ruleset)
    : null;
  const themed = toProfileCard(profile, ruleset, { accent: settings.accent, favorite });
  const card =
    settings.cover === "paper"
      ? { ...themed, player: { ...themed.player, coverUrl: null } }
      : themed;
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
