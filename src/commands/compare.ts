/**
 * @file src/commands/compare.ts
 * @desc /compare: two players side by side. `player` against you (or against `other`).
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Wed Oct 7, 2026
 */

import { userUrl } from "@haruhimemoe/osu/shapes";
import { SlashCommandBuilder } from "discord.js";
import { compareEmbed } from "../embeds/osu.ts";
import { parsePlayerInput, pickRuleset, playerKey, resolvePlayer } from "../services/players.ts";
import type { Command } from "../types.ts";
import { toCompareCard } from "../views/cards.ts";
import { addModeOption, cardReply, fail, linkButtons, linkHint } from "./shared.ts";

export const compare: Command = {
  category: "osu",
  data: addModeOption(
    new SlashCommandBuilder()
      .setName("compare")
      .setDescription("Two players head to head")
      .addStringOption((option) =>
        option
          .setName("player")
          .setDescription("osu! username, profile link or #id")
          .setRequired(true)
          .setMaxLength(64),
      )
      .addStringOption((option) =>
        option
          .setName("other")
          .setDescription("Compare against this player instead of you")
          .setMaxLength(64),
      ),
  ).toJSON(),
  async execute(interaction, s) {
    const first = parsePlayerInput(interaction.options.getString("player", true));
    if (!first) {
      await fail(interaction, "That isn't an osu! username.");
      return;
    }
    await interaction.deferReply();
    const second = await resolvePlayer(
      { name: interaction.options.getString("other"), callerId: interaction.user.id },
      s.linking,
    );
    if (!second.ok) {
      await fail(interaction, linkHint(s, true, second.discordId));
      return;
    }
    const settings = await s.settings.get(interaction.guildId);
    const asked = pickRuleset(interaction.options.getString("mode"), settings.defaultMode);
    const a = await s.osu.getUserProfile(playerKey(second.player), asked ? { ruleset: asked } : {});
    const ruleset = asked ?? a?.playmode ?? "osu";
    const b = await s.osu.getUserProfile(playerKey(first), { ruleset });
    if (!a || !b) {
      await fail(interaction, "osu! doesn't know one of those players.");
      return;
    }
    const [topA, topB] = await Promise.all([
      s.osu.getUserScores(a.osuId, "best", { ruleset, limit: 1 }),
      s.osu.getUserScores(b.osuId, "best", { ruleset, limit: 1 }),
    ]);
    const sides = [
      { profile: a, top: topA },
      { profile: b, top: topB },
    ] as const;
    const links = linkButtons(
      sides.map(({ profile }) => ({
        label: profile.username,
        url: `${userUrl(profile.osuId)}/${ruleset}`,
      })),
    );
    const png = await s.cards.draw("compare", toCompareCard(sides[0], sides[1], ruleset));
    await interaction.editReply(
      png
        ? cardReply(png, "compare.png", links)
        : { embeds: [compareEmbed(sides[0], sides[1], ruleset)], components: links },
    );
  },
};
