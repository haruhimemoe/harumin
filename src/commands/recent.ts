/**
 * @file src/commands/recent.ts
 * @desc /recent: a player's most recent play (fails too, unless asked not to), with pp from rosu
 *       when osu! gives none and the full-combo pp. Sets the channel's map.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { SlashCommandBuilder } from "discord.js";
import { scoreEmbed } from "../embeds/osu.ts";
import type { Command } from "../types.ts";
import { RULESET_NAMES } from "../utils/format.ts";
import { tryScorePp } from "../views/pp.ts";
import { addPlayerOptions, fail, loadPlayer } from "./shared.ts";

export const recent: Command = {
  category: "osu",
  data: addPlayerOptions(
    new SlashCommandBuilder().setName("recent").setDescription("A player's most recent play"),
  )
    .addIntegerOption((option) =>
      option
        .setName("index")
        .setDescription("1 is the latest, 2 the one before, ...")
        .setMinValue(1)
        .setMaxValue(50),
    )
    .addBooleanOption((option) => option.setName("passes-only").setDescription("Skip failed plays"))
    .toJSON(),
  async execute(interaction, s) {
    await interaction.deferReply();
    const loaded = await loadPlayer(interaction, s);
    if (!loaded) return;
    const { profile, ruleset } = loaded;
    const index = interaction.options.getInteger("index") ?? 1;
    const scores = await s.osu.getUserScores(profile.osuId, "recent", {
      ruleset,
      limit: 50,
      includeFails: !interaction.options.getBoolean("passes-only"),
    });
    const score = scores[index - 1];
    if (!score) {
      await fail(
        interaction,
        `**${profile.username}** has no ${index > 1 ? `#${index} ` : ""}recent ${RULESET_NAMES[ruleset]} play in the last 24 hours.`,
      );
      return;
    }
    const tries = scores
      .slice(index - 1)
      .findIndex(
        (other) =>
          other.beatmapId !== score.beatmapId ||
          other.mods.map((m) => m.acronym).join() !== score.mods.map((m) => m.acronym).join(),
      );
    const pp = await tryScorePp(s, score);
    s.context.set(interaction.channelId, { key: "map", beatmapId: score.beatmapId });
    await interaction.editReply({
      embeds: [
        scoreEmbed(score, {
          pp,
          player: profile,
          heading: index > 1 ? `Recent play #${index}` : "Most recent play",
          tries: tries === -1 ? scores.length - index + 1 : tries,
        }),
      ],
    });
  },
};
