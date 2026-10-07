/**
 * @file src/commands/nochoke.ts
 * @desc /nochoke: a player's top 100 as if every choke were a full combo. Each play with a miss
 *       or a dropped combo is recalculated with rosu; the list is re-sorted and the total pp
 *       recomputed (bonus pp kept). Needs up to 100 .osu files the first time, so it's slower
 *       and has a cooldown.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import type { OsuScore } from "@haruhimemoe/osu";
import { SlashCommandBuilder } from "discord.js";
import { scoreListEmbed } from "../embeds/osu.ts";
import { weightedPp } from "../embeds/social.ts";
import type { ScorePp } from "../services/pp.ts";
import type { Command } from "../types.ts";
import { mapLimit } from "../utils/async.ts";
import { formatPp, RULESET_NAMES } from "../utils/format.ts";
import { tryScorePp } from "../views/pp.ts";
import { addPlayerOptions, fail, loadPlayer } from "./shared.ts";

const COOLDOWN_MS = 30_000;
const lastUse = new Map<string, number>();

const choked = (score: OsuScore): boolean =>
  (score.statistics.miss ?? 0) > 0 ||
  (score.beatmap?.maxCombo != null &&
    score.maxCombo < score.beatmap.maxCombo &&
    !score.perfectCombo);

export const nochoke: Command = {
  category: "osu",
  data: addPlayerOptions(
    new SlashCommandBuilder()
      .setName("nochoke")
      .setDescription("Top plays if every choke had been a full combo"),
  ).toJSON(),
  async execute(interaction, s) {
    const last = lastUse.get(interaction.user.id) ?? 0;
    if (Date.now() - last < COOLDOWN_MS) {
      await fail(interaction, `One /nochoke every ${COOLDOWN_MS / 1000} seconds, please.`);
      return;
    }
    lastUse.set(interaction.user.id, Date.now());
    await interaction.deferReply();
    const loaded = await loadPlayer(interaction, s);
    if (!loaded) return;
    const { profile, ruleset } = loaded;
    const scores = await s.osu.getUserScores(profile.osuId, "best", { ruleset, limit: 100 });
    if (scores.length === 0) {
      await fail(
        interaction,
        `**${profile.username}** has no ${RULESET_NAMES[ruleset]} top plays.`,
      );
      return;
    }
    const recalculated = await mapLimit(scores, 6, async (score) => ({
      score,
      pp: choked(score) ? await tryScorePp(s, score) : null,
    }));
    const unfixed = recalculated.filter(({ score, pp }) => choked(score) && !pp).length;
    const value = ({ score, pp }: { score: OsuScore; pp: ScorePp | null }) =>
      Math.max(pp?.fcPp ?? 0, score.pp ?? 0);
    const before = weightedPp(scores.map((score) => score.pp ?? 0));
    const bonus = Math.max(0, profile.statistics.pp - before);
    const after = weightedPp(recalculated.map(value)) + bonus;
    const ranked = recalculated
      .map((entry, i) => ({ ...entry, place: i + 1, value: value(entry) }))
      .sort((a, b) => b.value - a.value)
      .filter((entry) => entry.pp && entry.value > (entry.score.pp ?? 0))
      .slice(0, 5);
    await interaction.editReply({
      embeds: [
        scoreListEmbed(ranked, {
          title: `${RULESET_NAMES[ruleset]} without chokes`,
          player: profile,
          page: 1,
          pages: 1,
          note: `${formatPp(profile.statistics.pp)} now · **${formatPp(after)}** without chokes (+${formatPp(after - profile.statistics.pp)})${unfixed ? ` · ${unfixed} play${unfixed === 1 ? "" : "s"} couldn't be recalculated` : ""}`,
        }),
      ],
    });
  },
};
