/**
 * @file src/embeds/social.ts
 * @desc Cards for groups of players: /server's ranking, /track's list and new-play posts,
 *       /matchcost, and /nochoke's summary.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Thu Oct 8, 2026
 */

import type { Ruleset, TrackEntry } from "@haruhimemoe/harumin-config";
import type { OsuMatch } from "@haruhimemoe/osu";
import { type MatchCostFormula, mapWins } from "@haruhimemoe/osu/match";
import { userUrl } from "@haruhimemoe/osu/shapes";
import type { APIEmbed } from "discord.js";
import { escapeMarkdown, flag, formatInt, RULESET_NAMES, truncate } from "../utils/format.ts";
import { card } from "./common.ts";

/** One row of /server. */
export type ServerRow = {
  discordId: string;
  username: string;
  osuId: number;
  countryCode: string | null;
  value: number;
};

/** What /server can rank by. */
export const SERVER_STATS = ["pp", "rank", "accuracy", "playcount", "level"] as const;
/** One of SERVER_STATS. */
export type ServerStat = (typeof SERVER_STATS)[number];

/** Each stat as text: "12,345pp", "#1,234", "98.12%". */
export const showStat: Readonly<Record<ServerStat, (n: number) => string>> = {
  pp: (n) => `${formatInt(Math.round(n))}pp`,
  rank: (n) => (n === Number.MAX_SAFE_INTEGER ? "unranked" : `#${formatInt(n)}`),
  accuracy: (n) => `${n.toFixed(2)}%`,
  playcount: (n) => `${formatInt(n)} plays`,
  level: (n) => `level ${n.toFixed(2)}`,
};

/**
 * @function serverEmbed
 * @param guildName {string} the guild
 * @param rows {readonly ServerRow[]} already sorted, one page
 * @param options {{ stat: ServerStat; ruleset: Ruleset; start: number; page: number; pages: number; total: number }}
 * @returns {APIEmbed} the ranking
 */
export const serverEmbed = (
  guildName: string,
  rows: readonly ServerRow[],
  options: {
    stat: ServerStat;
    ruleset: Ruleset;
    start: number;
    page: number;
    pages: number;
    total: number;
  },
): APIEmbed =>
  card({
    title: truncate(`${guildName} · ${RULESET_NAMES[options.ruleset]}`, 256),
    description:
      rows.length === 0
        ? "Nobody here has linked an osu! account yet. `/link` shows how."
        : [
            `-# ${options.total} linked member${options.total === 1 ? "" : "s"}, by ${options.stat}`,
            ...rows.map(
              (row, i) =>
                `\`#${String(options.start + i + 1).padStart(2, " ")}\` ${flag(row.countryCode)} [${escapeMarkdown(row.username)}](${userUrl(row.osuId)}) · **${showStat[options.stat](row.value)}** · <@${row.discordId}>`,
            ),
          ].join("\n"),
    footer: {
      text: options.pages > 1 ? `Page ${options.page} of ${options.pages} · harumin` : "harumin",
    },
  });

/**
 * @function trackListEmbed
 * @param entries {readonly TrackEntry[]} the guild's tracks
 * @param max {number} the cap
 * @returns {APIEmbed} who is tracked where
 */
export const trackListEmbed = (entries: readonly TrackEntry[], max: number): APIEmbed =>
  card({
    title: `Tracked players (${entries.length}/${max})`,
    description:
      entries.length === 0
        ? "Nobody yet. `/track add` posts a player's new top plays to a channel."
        : entries
            .map(
              (entry) =>
                `[${escapeMarkdown(entry.username)}](${userUrl(entry.osuId)}) · ${RULESET_NAMES[entry.mode]} · <#${entry.channelId}>`,
            )
            .join("\n"),
  });

/**
 * @function matchCostEmbed
 * @param match {OsuMatch} the match
 * @param costs {Map<number, number>} cost by user id
 * @param options {{ formula: MatchCostFormula; warmups: number; complete: boolean }}
 * @returns {APIEmbed} players by cost, with the map score when it's team vs
 */
export const matchCostEmbed = (
  match: OsuMatch,
  costs: Map<number, number>,
  options: { formula: MatchCostFormula; warmups: number; complete: boolean },
): APIEmbed => {
  const names = new Map(match.users.map((user) => [user.osuId, user]));
  const rows = [...costs.entries()].sort((a, b) => b[1] - a[1]);
  const wins = mapWins(match, { warmups: options.warmups });
  const red = wins.get("red");
  const blue = wins.get("blue");
  const score =
    red !== undefined || blue !== undefined ? `Red **${red ?? 0}** : **${blue ?? 0}** Blue` : "";
  return card({
    title: truncate(match.name, 256),
    url: `https://osu.ppy.sh/community/matches/${match.id}`,
    description:
      [
        score,
        `-# ${options.formula} formula${options.warmups ? ` · ${options.warmups} warmup${options.warmups === 1 ? "" : "s"} skipped` : ""}${options.complete ? "" : " · only the newest events (long match)"}`,
        ...rows.map(([userId, cost], i) => {
          const user = names.get(userId);
          const name = user
            ? `${flag(user.countryCode)} [${escapeMarkdown(user.username)}](${userUrl(userId)})`
            : `#${userId}`;
          return `\`#${String(i + 1).padStart(2, " ")}\` ${name} · **${cost.toFixed(2)}**`;
        }),
      ]
        .filter(Boolean)
        .join("\n") || "No completed games yet.",
  });
};

/**
 * @function weightedPp
 * @param pps {readonly number[]} top plays' pp, best first
 * @returns {number} the weighted sum osu! uses (0.95^i)
 */
export const weightedPp = (pps: readonly number[]): number =>
  [...pps].sort((a, b) => b - a).reduce((sum, pp, i) => sum + pp * 0.95 ** i, 0);
