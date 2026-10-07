/**
 * @file src/commands/leaderboard.ts
 * @desc /leaderboard: a map's global top 100, ten a page, optionally only scores with some mods
 *       (filtered here: osu! filters by mod only for supporters signed in).
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import type { BeatmapDetail, OsuScore } from "@haruhimemoe/osu";
import { formatMods } from "@haruhimemoe/osu/format";
import { SlashCommandBuilder } from "discord.js";
import { leaderboardEmbed } from "../embeds/osu.ts";
import { createTtlCache } from "../services/cache.ts";
import type { Command, Services } from "../types.ts";
import { matchesMods, parseModsInput } from "../utils/mods.ts";
import { pageOf } from "../utils/scores.ts";
import { addMapOption, fail, mapFromOption, pageButtons } from "./shared.ts";

const PER_PAGE = 10;
const boards = createTtlCache<number, { map: BeatmapDetail; scores: OsuScore[] }>(120_000, 200);

const load = async (s: Services, beatmapId: number) => {
  const hit = boards.get(beatmapId);
  if (hit) return hit;
  const map = await s.osu.getBeatmap(beatmapId);
  if (!map) return null;
  const board = { map, scores: await s.osu.getBeatmapScores(beatmapId, { limit: 100 }) };
  boards.set(beatmapId, board);
  return board;
};

const render = (board: { map: BeatmapDetail; scores: OsuScore[] }, mods: string, page: number) => {
  const filter = mods === "-" ? null : parseModsInput(mods);
  const scores = filter
    ? board.scores.filter((score) => matchesMods(score.mods, filter))
    : board.scores;
  const view = pageOf(scores, page, PER_PAGE);
  return {
    embeds: [
      leaderboardEmbed(board.map, view.items, {
        start: (view.page - 1) * PER_PAGE,
        page: view.page,
        pages: view.pages,
        mods: filter ? formatMods(filter) : null,
      }),
    ],
    components: pageButtons(`leaderboard:${board.map.beatmapId}:${mods}`, view.page, view.pages),
  };
};

export const leaderboard: Command = {
  category: "osu",
  data: addMapOption(
    new SlashCommandBuilder().setName("leaderboard").setDescription("A map's global leaderboard"),
  )
    .addStringOption((option) =>
      option
        .setName("mods")
        .setDescription("Only scores with these mods, e.g. HD, or NM")
        .setMaxLength(24),
    )
    .toJSON(),
  async execute(interaction, s) {
    const modsInput = interaction.options.getString("mods");
    const filter = modsInput ? parseModsInput(modsInput) : null;
    if (modsInput && filter === null) {
      await fail(interaction, "That isn't a mod combination. Try `HD` or `NM`.");
      return;
    }
    const beatmapId = await mapFromOption(interaction, s);
    if (!beatmapId) return;
    await interaction.deferReply();
    const board = await load(s, beatmapId);
    if (!board) {
      await fail(interaction, "osu! has no beatmap with that id.");
      return;
    }
    s.context.set(interaction.channelId, { key: "map", beatmapId });
    const mods = filter ? filter.map((mod) => mod.acronym).join("") || "NM" : "-";
    await interaction.editReply(render(board, mods, 1));
  },
  async button(interaction, s, [beatmapId, mods, page]) {
    await interaction.deferUpdate();
    const board = await load(s, Number(beatmapId));
    if (board) await interaction.editReply(render(board, mods ?? "-", Number(page)));
  },
};
