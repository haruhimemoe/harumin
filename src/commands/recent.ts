/**
 * @file src/commands/recent.ts
 * @desc /recent: a player's most recent play (fails too, unless asked not to), with pp from rosu
 *       when osu! gives none and the full-combo pp, as a card image (the text embed when the
 *       image can't be had), and the 24 h session on the map ("23 today", "best of 23").
 *       Sets the channel's map.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Thu Oct 8, 2026
 */

import { beatmapUrl } from "@haruhimemoe/osu/shapes";
import { SlashCommandBuilder } from "discord.js";
import { scoreEmbed } from "../embeds/osu.ts";
import type { Command } from "../types.ts";
import { mapLabel, RULESET_NAMES } from "../utils/format.ts";
import { toScoreCard } from "../views/cards.ts";
import { tryScorePp } from "../views/pp.ts";
import { sessionOf } from "../views/session.ts";
import { addPlayerOptions, cardReply, fail, linkButtons, loadPlayer } from "./shared.ts";

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
    // Fails always come back, so the session counts every try; passes-only just skips them here.
    const all = await s.osu.getUserScores(profile.osuId, "recent", {
      ruleset,
      limit: 100,
      includeFails: true,
    });
    const scores = interaction.options.getBoolean("passes-only")
      ? all.filter((play) => play.passed)
      : all;
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
    if (score.beatmap && score.beatmapset) {
      s.context.nameMap(score.beatmapId, mapLabel({ ...score.beatmapset, ...score.beatmap }));
    }
    s.context.rememberMap(interaction.channelId, score.beatmapId);
    const heading = index > 1 ? `Recent play #${index}` : "Most recent play";
    const tryCount = tries === -1 ? scores.length - index + 1 : tries;
    const session = sessionOf(
      all.map((play) => ({
        beatmapId: play.beatmapId,
        passed: play.passed,
        accuracy: play.accuracy * 100,
        totalScore: play.totalScore,
      })),
      all.indexOf(score),
    );
    const links = linkButtons([{ label: "Beatmap", url: beatmapUrl(score.beatmapId) }]);
    const png = await s.cards.draw(
      "score",
      toScoreCard(score, { profile, ruleset, pp, heading, tries: tryCount, session }),
    );
    await interaction.editReply(
      png
        ? cardReply(png, "recent.png", links)
        : {
            embeds: [
              scoreEmbed(score, {
                pp,
                player: profile,
                heading,
                tries: tryCount,
                session,
              }),
            ],
            components: links,
          },
    );
  },
};
