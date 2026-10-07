/**
 * @file src/commands/compare.ts
 * @desc /compare: two players side by side. `player` against you (or against `other`).
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { SlashCommandBuilder } from "discord.js";
import { compareEmbed } from "../embeds/osu.ts";
import { parsePlayerInput, pickRuleset, playerKey, resolvePlayer } from "../services/players.ts";
import type { Command } from "../types.ts";
import { addModeOption, fail, linkHint } from "./shared.ts";

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
    await interaction.editReply({
      embeds: [compareEmbed({ profile: a, top: topA }, { profile: b, top: topB }, ruleset)],
    });
  },
};
