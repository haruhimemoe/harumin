/**
 * @file src/views/toolCards.ts
 * @desc The match, pack and pool, server, tracks and bb card images' data (harumin-config's card
 *       shapes), from what the commands already have: a match and its costs, a pool's slots and
 *       what osu! says about them, a server's ranking, its tracks. Text is cut to the contract's
 *       limits so a card always parses.
 * @author David @dvhsh (https://dvh.sh)
 * @created Thu Oct 8, 2026
 * @modified Thu Oct 8, 2026
 */

import type { ComplianceVerdict } from "@haruhimemoe/compliance";
import {
  MAX_MATCH_ROWS,
  MAX_POOL_SLOTS,
  type MatchCostCard,
  type PoolCard,
  type Ruleset,
  type ServerCard,
  type TrackEntry,
  type TracksCard,
} from "@haruhimemoe/harumin-config";
import type { BeatmapMeta, OsuMatch } from "@haruhimemoe/osu";
import { listGames, type MatchCostFormula, mapWins } from "@haruhimemoe/osu/match";
import { slotLabel } from "@haruhimemoe/pool";
import type { CardSlot } from "../embeds/tools.ts";
import type { Mine } from "./poolMe.ts";

const cut = (text: string, max: number): string => (text.length > max ? text.slice(0, max) : text);

const country = (code: string | null | undefined): string | null =>
  code && /^[A-Z]{2}$/.test(code) ? code : null;

/**
 * @function toMatchCostCard
 * @param match {OsuMatch} the match
 * @param costs {Map<number, number>} cost by user id
 * @param options {{ formula; warmups; complete }} how it was worked out
 * @returns {MatchCostCard} /matchcost's card: the best MAX_MATCH_ROWS players
 */
export const toMatchCostCard = (
  match: OsuMatch,
  costs: Map<number, number>,
  options: { formula: MatchCostFormula; warmups: number; complete: boolean },
): MatchCostCard => {
  const users = new Map(match.users.map((user) => [user.osuId, user]));
  const games = listGames(match, { warmups: options.warmups });
  const teams = new Map<number, "red" | "blue">();
  for (const game of games)
    for (const score of game.scores)
      if (score.team === "red" || score.team === "blue") teams.set(score.userId, score.team);
  const wins = mapWins(match, { warmups: options.warmups });
  const red = wins.get("red");
  const blue = wins.get("blue");
  const ranked = [...costs.entries()].sort((a, b) => b[1] - a[1]);
  const note = [
    options.warmups ? `${options.warmups} warmup${options.warmups === 1 ? "" : "s"} skipped` : "",
    options.complete ? "" : "only the newest events (long match)",
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    name: cut(match.name, 128) || `Match ${match.id}`,
    formula: options.formula,
    note: note || null,
    teams: red !== undefined || blue !== undefined ? { red: red ?? 0, blue: blue ?? 0 } : null,
    games: games.length,
    rows: ranked.slice(0, MAX_MATCH_ROWS).map(([userId, cost], i) => {
      const user = users.get(userId);
      return {
        place: i + 1,
        osuId: userId > 0 ? userId : null,
        username: cut(user?.username ?? "", 32) || `#${userId}`.slice(0, 32),
        countryCode: country(user?.countryCode),
        team: teams.get(userId) ?? null,
        cost: Math.max(0, cost),
      };
    }),
    more: Math.max(0, ranked.length - MAX_MATCH_ROWS),
  };
};

/** What the pool card is drawn from. */
export type PoolCardInput = {
  source: PoolCard["source"];
  name: string;
  subtitle?: string | null | undefined;
  /** /pool me: the player's best score per beatmap id (null: not played). */
  mine?: ReadonlyMap<number, Mine | null> | undefined;
  slots: readonly CardSlot[];
  meta: ReadonlyMap<number, BeatmapMeta>;
  /** /pool check: each map's verdict by beatmap id (null: osu! didn't answer). */
  verdicts?: ReadonlyMap<number, ComplianceVerdict | null> | undefined;
  note?: string | null | undefined;
};

/**
 * @function toPoolCard
 * @param input {PoolCardInput} the pool, what osu! knows about its maps, and any verdicts
 * @returns {PoolCard} the pack or pool card: the first MAX_POOL_SLOTS slots
 */
export const toPoolCard = ({
  source,
  name,
  subtitle,
  slots,
  meta,
  verdicts,
  mine,
  note,
}: PoolCardInput): PoolCard => {
  const stars = slots
    .map((slot) => meta.get(slot.beatmapId)?.starRating)
    .filter((n): n is number => n !== undefined && n >= 0);
  return {
    source,
    name: cut(name, 128),
    subtitle: subtitle ? cut(subtitle, 160) : null,
    mapCount: slots.length,
    stars: stars.length ? { min: Math.min(...stars), max: Math.max(...stars) } : null,
    slots: slots.slice(0, MAX_POOL_SLOTS).map((slot) => {
      const map = meta.get(slot.beatmapId);
      const verdict = verdicts?.get(slot.beatmapId);
      return {
        label: cut(slotLabel(slot), 8) || "?",
        mod: slot.mod ? cut(slot.mod.toUpperCase(), 4) : null,
        title: map ? cut(`${map.artist} - ${map.title} [${map.version}]`, 200) : null,
        beatmapId: slot.beatmapId,
        stars: map && map.starRating >= 0 ? map.starRating : null,
        lengthSeconds: map ? Math.max(0, Math.round(map.lengthSeconds)) : null,
        check: verdicts ? (verdict ? verdict.status : "unknown") : null,
        ...(mine ? { mine: mine.get(slot.beatmapId) ?? null } : {}),
      };
    }),
    note: note ? cut(note, 200) : null,
  };
};

/** What /practice's card is drawn from. */
export type PracticeCardInput = {
  name: string;
  subtitle: string;
  bucket: string;
  maps: readonly { beatmapId: number; title: string; stars: number; lengthSeconds: number }[];
};

/**
 * @function toPracticeCard
 * @param input {PracticeCardInput} the pick, stars already under the bucket's mods
 * @returns {PoolCard} the pool card with source "practice", slots labelled HR1, HR2...
 */
export const toPracticeCard = ({ name, subtitle, bucket, maps }: PracticeCardInput): PoolCard => {
  const stars = maps.map((map) => map.stars);
  return {
    source: "practice",
    name: cut(name, 128),
    subtitle: cut(subtitle, 160),
    mapCount: maps.length,
    stars: stars.length ? { min: Math.min(...stars), max: Math.max(...stars) } : null,
    slots: maps.slice(0, MAX_POOL_SLOTS).map((map, i) => ({
      label: cut(`${bucket}${i + 1}`, 8),
      mod: cut(bucket, 4),
      title: cut(map.title, 200),
      beatmapId: map.beatmapId,
      stars: Math.max(0, map.stars),
      lengthSeconds: Math.max(0, Math.round(map.lengthSeconds)),
      check: null,
    })),
    note: null,
  };
};

/**
 * @function toServerCard
 * @param guild {{ id: string; name: string; icon: string | null }} the server
 * @param rows {readonly { osuId: number; username: string; countryCode: string | null; value: string }[]} one page, sorted, the stat as text
 * @param options {{ ruleset; stat; start; page; pages; total }}
 * @returns {ServerCard} /server's card
 */
export const toServerCard = (
  guild: { id: string; name: string; icon: string | null },
  rows: readonly { osuId: number; username: string; countryCode: string | null; value: string }[],
  options: {
    ruleset: Ruleset;
    stat: string;
    start: number;
    page: number;
    pages: number;
    total: number;
  },
): ServerCard => ({
  guild: {
    id: guild.id,
    name: cut(guild.name, 100) || "This server",
    icon: guild.icon && /^(a_)?[0-9a-f]{32}$/.test(guild.icon) ? guild.icon : null,
  },
  ruleset: options.ruleset,
  stat: cut(options.stat, 16),
  total: options.total,
  page: options.page,
  pages: Math.max(1, options.pages),
  rows: rows.map((row, i) => ({
    place: options.start + i + 1,
    osuId: row.osuId,
    username: cut(row.username, 32) || "?",
    countryCode: country(row.countryCode),
    value: cut(row.value, 24),
  })),
});

/**
 * @function toTracksCard
 * @param entries {readonly TrackEntry[]} the server's tracks
 * @param max {number} the cap
 * @param channelName {(id: string) => string | undefined} a channel's name, when harumin can see it
 * @returns {TracksCard} /track list's card
 */
export const toTracksCard = (
  entries: readonly TrackEntry[],
  max: number,
  channelName: (id: string) => string | undefined,
): TracksCard => ({
  max,
  rows: entries.map((entry) => ({
    osuId: entry.osuId,
    username: cut(entry.username, 32) || "?",
    ruleset: entry.mode,
    channel: cut(channelName(entry.channelId) ?? "unknown-channel", 100),
  })),
});
