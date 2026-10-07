/**
 * @file src/commands/matchcost.ts
 * @desc /matchcost: each player's match cost in a multiplayer match (the channel's last match
 *       link when none is given), by Bathbot's formula or another one.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { MATCH_COST_FORMULAS, type MatchCostFormula, matchCosts } from "@haruhimemoe/osu/match";
import { parseMatchId } from "@haruhimemoe/osu/shapes";
import { SlashCommandBuilder } from "discord.js";
import { matchCostEmbed } from "../embeds/social.ts";
import type { Command, Services } from "../types.ts";
import { fail } from "./shared.ts";

/**
 * @function renderMatchCost
 * @param s {Pick<Services, "osu">} osu!
 * @param matchId {number} the match
 * @param options {{ formula?: MatchCostFormula; warmups?: number }}
 * @returns {Promise<import("discord.js").APIEmbed | null>} the card, or null when osu! has no such match
 */
export const renderMatchCost = async (
  s: Pick<Services, "osu">,
  matchId: number,
  { formula = "bathbot", warmups = 0 }: { formula?: MatchCostFormula; warmups?: number } = {},
) => {
  const found = await s.osu.getMatch(matchId);
  if (!found) return null;
  return matchCostEmbed(found.match, matchCosts(found.match, { formula, warmups }), {
    formula,
    warmups,
    complete: found.complete,
  });
};

export const matchcost: Command = {
  category: "osu",
  data: new SlashCommandBuilder()
    .setName("matchcost")
    .setDescription("Match costs for a multiplayer match")
    .addStringOption((option) =>
      option
        .setName("match")
        .setDescription("mp link or id (default: the last match linked here)")
        .setMaxLength(200),
    )
    .addIntegerOption((option) =>
      option
        .setName("warmups")
        .setDescription("Games to skip at the start")
        .setMinValue(0)
        .setMaxValue(10),
    )
    .addStringOption((option) =>
      option
        .setName("formula")
        .setDescription("Default Bathbot's")
        .addChoices(...MATCH_COST_FORMULAS.map((value) => ({ name: value, value }))),
    )
    .toJSON(),
  async execute(interaction, s) {
    const input = interaction.options.getString("match");
    const matchId = input
      ? parseMatchId(input)
      : (s.context.get(interaction.channelId, "match")?.matchId ?? null);
    if (!matchId) {
      await fail(
        interaction,
        input
          ? "That isn't an mp link or id."
          : "Which match? Pass `match`, or link one here first.",
      );
      return;
    }
    await interaction.deferReply();
    const embed = await renderMatchCost(s, matchId, {
      formula: (interaction.options.getString("formula") as MatchCostFormula | null) ?? "bathbot",
      warmups: interaction.options.getInteger("warmups") ?? 0,
    });
    if (!embed) {
      await fail(interaction, "osu! has no match with that id (or it's private).");
      return;
    }
    s.context.set(interaction.channelId, { key: "match", matchId });
    await interaction.editReply({ embeds: [embed] });
  },
  async button(interaction, s, [action, id]) {
    if (action !== "run" || !id) return;
    await interaction.deferReply();
    const embed = await renderMatchCost(s, Number(id));
    if (!embed) {
      await fail(interaction, "osu! has no match with that id (or it's private).");
      return;
    }
    await interaction.editReply({ embeds: [embed] });
  },
};
