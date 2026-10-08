/**
 * @file src/commands/score.ts
 * @desc /score: a player's scores on one map (the channel's last map when none is given), best
 *       first. The best one as a score card, the next five as a list card (text embeds when
 *       the images can't be had).
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Wed Oct 7, 2026
 */

import { beatmapUrl, userUrl } from "@haruhimemoe/osu/shapes";
import { SlashCommandBuilder } from "discord.js";
import { scoreEmbed, scoreListEmbed } from "../embeds/osu.ts";
import type { Command } from "../types.ts";
import { toScoreCard, toScoreListCard } from "../views/cards.ts";
import { tryScorePp } from "../views/pp.ts";
import {
  addMapOption,
  addPlayerOptions,
  cardReply,
  fail,
  linkButtons,
  loadPlayer,
  mapFromOption,
} from "./shared.ts";

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
    const heading = "Best score on this map";
    const rest = scores.slice(1, 6).map((each, i) => ({ score: each, place: i + 2 }));
    const restTitle = `${scores.length - 1} more`;
    const links = linkButtons([
      { label: "Beatmap", url: beatmapUrl(beatmapId) },
      { label: "osu! profile", url: `${userUrl(profile.osuId)}/${best.ruleset}` },
    ]);
    const [png, restPng] = await Promise.all([
      s.cards.draw(
        "score",
        toScoreCard(best, { profile, ruleset: best.ruleset, pp, heading, tries: 1 }),
      ),
      rest.length
        ? s.cards.draw(
            "scores",
            toScoreListCard(rest, {
              profile,
              ruleset: best.ruleset,
              title: restTitle,
              note: null,
              page: 1,
              pages: 1,
            }),
          )
        : null,
    ]);
    const restEmbeds =
      rest.length && !restPng
        ? [scoreListEmbed(rest, { title: restTitle, page: 1, pages: 1 })]
        : [];
    if (png) {
      await interaction.editReply({
        ...cardReply(
          png,
          "score.png",
          links,
          restPng ? [{ attachment: restPng, name: "scores.png" }] : [],
        ),
        embeds: restEmbeds,
      });
      return;
    }
    await interaction.editReply({
      embeds: [
        scoreEmbed(best, { pp, player: profile, heading }),
        ...(rest.length ? [scoreListEmbed(rest, { title: restTitle, page: 1, pages: 1 })] : []),
      ],
      components: links,
    });
  },
};
