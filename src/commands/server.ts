/**
 * @file src/commands/server.ts
 * @desc /server: this server's linked players ranked by a stat. Members come from who harumin has
 *       seen here (no privileged intent), linked accounts from the hub, numbers from osu!
 *       (at most 50 profiles, cached ten minutes).
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import type { Ruleset } from "@haruhimemoe/harumin-config";
import type { OsuUserProfile } from "@haruhimemoe/osu";
import { InteractionContextType, SlashCommandBuilder } from "discord.js";
import { SERVER_STATS, type ServerRow, type ServerStat, serverEmbed } from "../embeds/social.ts";
import { createTtlCache } from "../services/cache.ts";
import { pickRuleset } from "../services/players.ts";
import type { Command, Services } from "../types.ts";
import { mapLimit } from "../utils/async.ts";
import { pageOf } from "../utils/scores.ts";
import { addModeOption, fail, pageButtons } from "./shared.ts";

const PER_PAGE = 10;
const MAX_PLAYERS = 50;
const profiles = createTtlCache<string, OsuUserProfile | null>(600_000, 5_000);
const boards = createTtlCache<string, { rows: ServerRow[]; name: string }>(120_000, 200);

const statOf = (profile: OsuUserProfile, stat: ServerStat): number => {
  const s = profile.statistics;
  switch (stat) {
    case "pp":
      return s.pp;
    case "rank":
      return s.globalRank ?? Number.MAX_SAFE_INTEGER;
    case "accuracy":
      return s.accuracy;
    case "playcount":
      return s.playCount;
    case "level":
      return s.level;
  }
};

const build = async (s: Services, guildId: string, ruleset: Ruleset, stat: ServerStat) => {
  const seen = await s.members.inGuild(guildId);
  const linked = await s.linking.getMany(seen);
  const entries = [...linked.entries()].slice(0, MAX_PLAYERS);
  const loaded = await mapLimit(entries, 4, async ([discordId, account]) => {
    const key = `${account.osuId}:${ruleset}`;
    let profile = profiles.get(key);
    if (profile === undefined) {
      profile = await s.osu.getUserProfile(account.osuId, { ruleset }).catch(() => null);
      profiles.set(key, profile);
    }
    return profile ? { discordId, profile } : null;
  });
  const rows = loaded
    .filter((row): row is { discordId: string; profile: OsuUserProfile } => row !== null)
    .map(({ discordId, profile }) => ({
      discordId,
      username: profile.username,
      osuId: profile.osuId,
      countryCode: profile.countryCode,
      value: statOf(profile, stat),
    }));
  rows.sort((a, b) => (stat === "rank" ? a.value - b.value : b.value - a.value));
  return rows;
};

const render = (
  name: string,
  rows: ServerRow[],
  key: { guildId: string; ruleset: Ruleset; stat: ServerStat },
  page: number,
) => {
  const view = pageOf(rows, page, PER_PAGE);
  return {
    embeds: [
      serverEmbed(name, view.items, {
        stat: key.stat,
        ruleset: key.ruleset,
        start: (view.page - 1) * PER_PAGE,
        page: view.page,
        pages: view.pages,
        total: rows.length,
      }),
    ],
    components: pageButtons(`server:${key.ruleset}:${key.stat}`, view.page, view.pages),
    allowedMentions: { parse: [] },
  };
};

export const server: Command = {
  category: "osu",
  data: addModeOption(
    new SlashCommandBuilder()
      .setName("server")
      .setDescription("This server's linked players, ranked")
      .setContexts(InteractionContextType.Guild)
      .addStringOption((option) =>
        option
          .setName("stat")
          .setDescription("Rank by (default pp)")
          .addChoices(...SERVER_STATS.map((value) => ({ name: value, value }))),
      ),
  ).toJSON(),
  async execute(interaction, s) {
    if (!interaction.guildId || !interaction.guild) {
      await fail(interaction, "/server only works in a server.");
      return;
    }
    await interaction.deferReply();
    const settings = await s.settings.get(interaction.guildId);
    const ruleset =
      pickRuleset(interaction.options.getString("mode"), settings.defaultMode) ?? "osu";
    const stat = (interaction.options.getString("stat") as ServerStat | null) ?? "pp";
    const rows = await build(s, interaction.guildId, ruleset, stat);
    boards.set(`${interaction.guildId}:${ruleset}:${stat}`, { rows, name: interaction.guild.name });
    await interaction.editReply(
      render(interaction.guild.name, rows, { guildId: interaction.guildId, ruleset, stat }, 1),
    );
  },
  async button(interaction, s, [ruleset, stat, page]) {
    if (!interaction.guildId) return;
    await interaction.deferUpdate();
    const key = {
      guildId: interaction.guildId,
      ruleset: ruleset as Ruleset,
      stat: stat as ServerStat,
    };
    let board = boards.get(`${key.guildId}:${key.ruleset}:${key.stat}`);
    if (!board) {
      board = {
        rows: await build(s, key.guildId, key.ruleset, key.stat),
        name: interaction.guild?.name ?? "This server",
      };
      boards.set(`${key.guildId}:${key.ruleset}:${key.stat}`, board);
    }
    await interaction.editReply(render(board.name, board.rows, key, Number(page)));
  },
};
