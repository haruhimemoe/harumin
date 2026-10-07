/**
 * @file src/commands/score.ts
 * @desc /score: a player's scores on one map (the channel's last map when none is given), best
 *       first. The best one shows in full, the rest as lines.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Wed Oct 7, 2026
 */

import { SlashCommandBuilder } from "discord.js";
import { scoreEmbed, scoreListEmbed } from "../embeds/osu.ts";
import type { Command } from "../types.ts";
import { tryScorePp } from "../views/pp.ts";
import { addMapOption, addPlayerOptions, fail, loadPlayer, mapFromOption } from "./shared.ts";

export const score: Command = {
  category: "osu",
  data: addPlayerOptions(
    addMapOption(
      new SlashCommandBuilder().setName("score").setDescription("A player's scores on a map"),
    ),
  ).toJSON(),
  async execute(interaction, s) {
    const beatmapId = await mapFromOption(interaction, s);
    if (!beatmapId) return;
    await interaction.deferReply();
    const loaded = await loadPlayer(interaction, s);
    if (!loaded) return;
    const { profile } = loaded;
    const ruleset = interaction.options.getString("mode") ? loaded.ruleset : undefined;
    const scores = await s.osu.getBeatmapUserScores(
      beatmapId,
      profile.osuId,
      ruleset ? { ruleset } : {},
    );
    s.context.set(interaction.channelId, { key: "map", beatmapId });
    const best = scores.sort((a, b) => (b.pp ?? 0) - (a.pp ?? 0) || b.totalScore - a.totalScore)[0];
    if (!best) {
      await fail(interaction, `**${profile.username}** has no scores on that map.`);
      return;
    }
    if (!best.beatmap || !best.beatmapset) {
      const map = await s.osu.getBeatmap(beatmapId);
      if (map) {
        for (const each of scores) {
          each.beatmap ??= {
            beatmapId: map.beatmapId,
            beatmapsetId: map.beatmapsetId,
            version: map.version,
            starRating: map.starRating,
            mode: map.mode,
            checksum: map.checksum,
            maxCombo: map.maxCombo,
          };
          each.beatmapset ??= {
            beatmapsetId: map.beatmapsetId,
            title: map.title,
            artist: map.artist,
            titleUnicode: null,
            artistUnicode: null,
            creator: map.creator,
          };
        }
      }
    }
    const pp = await tryScorePp(s, best);
    const embeds = [scoreEmbed(best, { pp, player: profile, heading: "Best score on this map" })];
    if (scores.length > 1) {
      embeds.push(
        scoreListEmbed(
          scores.slice(1, 6).map((each, i) => ({ score: each, place: i + 2 })),
          { title: `${scores.length - 1} more`, page: 1, pages: 1 },
        ),
      );
    }
    await interaction.editReply({ embeds });
  },
};
