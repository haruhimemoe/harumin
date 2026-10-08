/**
 * @file src/embeds/osu.ts
 * @desc osu! cards: profiles, a single score, score lists (/top, /score, /nochoke), map cards,
 *       leaderboards, /compare and /simulate. Each takes the data it shows and returns an
 *       APIEmbed.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import type { Ruleset } from "@haruhimemoe/harumin-config";
import type { BeatmapDetail, OsuScore, OsuUserProfile } from "@haruhimemoe/osu";
import {
  formatAccuracy,
  formatBpm,
  formatDuration,
  formatMods,
  formatStars,
  formatStat,
} from "@haruhimemoe/osu/format";
import { beatmapUrl, coverUrl, userUrl } from "@haruhimemoe/osu/shapes";
import type { APIEmbed, APIEmbedField } from "discord.js";
import type { AccuracyPp, MapAttributes, ScorePp } from "../services/pp.ts";
import {
  completion,
  discordTime,
  escapeMarkdown,
  flag,
  formatHits,
  formatInt,
  formatPlayTime,
  formatPp,
  GRADE_TEXT,
  RULESET_NAMES,
  truncate,
} from "../utils/format.ts";
import type { Session } from "../views/session.ts";
import { card } from "./common.ts";

/** A player shown as an embed author: name, flag, rank, avatar, profile link. */
type AuthorPlayer = Pick<OsuUserProfile, "osuId" | "username" | "avatarUrl" | "countryCode"> & {
  statistics?: Pick<OsuUserProfile["statistics"], "pp" | "globalRank"> | undefined;
};

/**
 * @function playerAuthor
 * @param player {AuthorPlayer} who
 * @returns {APIEmbed["author"]} "peppy 🇦🇺 · 1,234pp (#5,678)" with the avatar
 */
export const playerAuthor = (player: AuthorPlayer): NonNullable<APIEmbed["author"]> => {
  const stats = player.statistics;
  const rank = stats
    ? ` · ${formatInt(Math.round(stats.pp))}pp${stats.globalRank ? ` (#${formatInt(stats.globalRank)})` : ""}`
    : "";
  return {
    name: truncate(
      `${player.username} ${flag(player.countryCode)}${rank}`.replace(/\s+/g, " ").trim(),
      256,
    ),
    url: userUrl(player.osuId),
    ...(player.avatarUrl ? { icon_url: player.avatarUrl } : {}),
  };
};

/**
 * @function mapTitle
 * @param score {Pick<OsuScore, "beatmap" | "beatmapset">} a score with its map
 * @returns {string} "Artist - Title [Version]"
 */
export const mapTitle = (score: Pick<OsuScore, "beatmap" | "beatmapset">): string => {
  const set = score.beatmapset;
  const version = score.beatmap ? ` [${score.beatmap.version}]` : "";
  return truncate(set ? `${set.artist} - ${set.title}${version}` : `Beatmap${version}`, 256);
};

/**
 * @function profileEmbed
 * @param profile {OsuUserProfile} the player
 * @param ruleset {Ruleset} which ruleset's numbers these are
 * @returns {APIEmbed} the profile card
 */
export const profileEmbed = (profile: OsuUserProfile, ruleset: Ruleset): APIEmbed => {
  const s = profile.statistics;
  const ranks = s.globalRank
    ? `**#${formatInt(s.globalRank)}** global${s.countryRank ? ` · **#${formatInt(s.countryRank)}** ${flag(profile.countryCode) || profile.countryCode || ""}` : ""}`
    : "Unranked";
  const grades = `SS+ ${formatInt(s.grades.ssh)} · SS ${formatInt(s.grades.ss)} · S+ ${formatInt(s.grades.sh)} · S ${formatInt(s.grades.s)} · A ${formatInt(s.grades.a)}`;
  return card({
    author: { name: `${RULESET_NAMES[ruleset]} profile`, url: userUrl(profile.osuId) },
    title: truncate(`${profile.username} ${flag(profile.countryCode)}`.trim(), 256),
    url: userUrl(profile.osuId),
    ...(profile.avatarUrl ? { thumbnail: { url: profile.avatarUrl } } : {}),
    description: [
      ranks,
      `**${formatPp(s.pp)}** · ${s.accuracy.toFixed(2)}% accuracy`,
      `Level ${s.level.toFixed(2)} · ${formatInt(s.playCount)} plays · ${formatPlayTime(s.playTime)}`,
      `Max combo ${formatInt(s.maxCombo)} · Ranked score ${formatInt(s.rankedScore)}`,
      grades,
      profile.joinDate
        ? `Joined ${discordTime(profile.joinDate, "D")}${profile.supporter ? " · supporter" : ""}`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
    ...(profile.coverUrl ? { image: { url: profile.coverUrl } } : {}),
  });
};

/**
 * @function scoreLines
 * @param score {OsuScore} the score
 * @param pp {ScorePp | null} rosu's numbers for it (null when the .osu file wasn't available)
 * @returns {string[]} the three lines a score shows: grade and mods; pp and accuracy; score,
 *          combo and hits
 */
export const scoreLines = (score: OsuScore, pp: ScorePp | null): string[] => {
  const stars = pp?.stars ?? score.beatmap?.starRating;
  const maxCombo = pp?.maxCombo ?? score.beatmap?.maxCombo ?? null;
  const done = score.passed ? null : completion(score);
  const grade = `**${GRADE_TEXT[score.rank]}**${done !== null ? ` (${done.toFixed(1)}%)` : ""}`;
  const shownPp = score.pp ?? (score.passed ? (pp?.pp ?? null) : null);
  const approx = score.pp === null && shownPp !== null ? "≈" : "";
  const isFc =
    score.perfectCombo ||
    (maxCombo !== null && score.maxCombo >= maxCombo && (score.statistics.miss ?? 0) === 0);
  const fc = pp && !isFc ? ` (FC ${formatPp(pp.fcPp)} at ${pp.fcAccuracy.toFixed(2)}%)` : "";
  return [
    `${grade} · ${formatMods(score.mods)}${stars !== undefined ? ` · ${formatStars(stars)}★` : ""}`,
    `**${approx}${formatPp(shownPp)}**${fc} · ${formatAccuracy(score.accuracy)}`,
    `${formatInt(score.totalScore)} · x${formatInt(score.maxCombo)}${maxCombo ? `/${formatInt(maxCombo)}` : ""} · ${formatHits(score.statistics, score.ruleset)}`,
  ];
};

/**
 * @function scoreEmbed
 * @param score {OsuScore} the score (with its beatmap, set and user)
 * @param options {{ pp: ScorePp | null; player?: AuthorPlayer; heading?: string; tries?: number }}
 *        rosu's numbers, who set it, and a line above the title ("Most recent play")
 * @returns {APIEmbed} the score card
 */
export const scoreEmbed = (
  score: OsuScore,
  options: {
    pp: ScorePp | null;
    player?: AuthorPlayer | undefined;
    heading?: string | undefined;
    tries?: number | undefined;
    session?: Session | undefined;
  },
): APIEmbed => {
  const player: AuthorPlayer | null = options.player ?? (score.user ? { ...score.user } : null);
  const lines = scoreLines(score, options.pp);
  if (options.tries && options.tries > 1) lines.push(`Try #${options.tries}`);
  if (options.session && options.session.today > 1) {
    lines.push(
      [`${options.session.today} today`, options.session.note].filter(Boolean).join(" · "),
    );
  }
  const setId = score.beatmap?.beatmapsetId ?? score.beatmapset?.beatmapsetId;
  return card({
    ...(player ? { author: playerAuthor(player) } : {}),
    title: mapTitle(score),
    url: beatmapUrl(score.beatmapId),
    description: [
      options.heading ? `-# ${options.heading}` : "",
      ...lines,
      `-# ${discordTime(score.endedAt)}`,
    ]
      .filter(Boolean)
      .join("\n"),
    ...(setId ? { thumbnail: { url: coverUrl(setId, "list@2x") } } : {}),
  });
};

/**
 * @function scoreListEmbed
 * @param entries {readonly { score: OsuScore; place: number; pp?: ScorePp | null }[]} one page
 * @param options {{ title: string; player?: AuthorPlayer; page: number; pages: number; note?: string }}
 * @returns {APIEmbed} a numbered list card ("#1 Artist - Title [Diff]" then two lines each)
 */
export const scoreListEmbed = (
  entries: readonly { score: OsuScore; place: number; pp?: ScorePp | null | undefined }[],
  options: {
    title: string;
    player?: AuthorPlayer | undefined;
    page: number;
    pages: number;
    note?: string | undefined;
    url?: string | undefined;
  },
): APIEmbed => {
  const body = entries.map(({ score, place, pp }) => {
    const [first, second, third] = scoreLines(score, pp ?? null);
    return `**#${place}** [${escapeMarkdown(mapTitle(score))}](${beatmapUrl(score.beatmapId)})\n${first}\n${second} · ${discordTime(score.endedAt)}\n-# ${third}`;
  });
  return card({
    ...(options.player ? { author: playerAuthor(options.player) } : {}),
    title: options.title,
    ...(options.url ? { url: options.url } : {}),
    description: truncate(
      [options.note ? `-# ${options.note}` : "", ...body].filter(Boolean).join("\n\n") ||
        "Nothing here.",
      4096,
    ),
    footer: {
      text: options.pages > 1 ? `Page ${options.page} of ${options.pages} · harumin` : "harumin",
    },
  });
};

/**
 * @function mapEmbed
 * @param map {BeatmapDetail} the difficulty
 * @param options {{ mods; stars; attrs?; pps? }} shown mods, the star rating with them, rosu's
 *        attributes and pp at accuracies (both absent when the .osu file wasn't available)
 * @returns {APIEmbed} the map card
 */
export const mapEmbed = (
  map: BeatmapDetail,
  options: {
    mods: readonly { acronym: string; settings?: Record<string, unknown> | undefined }[];
    stars: number | null;
    attrs?: MapAttributes | null | undefined;
    pps?: readonly AccuracyPp[] | null | undefined;
  },
): APIEmbed => {
  const attrs = options.attrs;
  const rate = attrs?.clockRate ?? 1;
  const stars = options.stars ?? attrs?.stars ?? map.starRating;
  const fields: APIEmbedField[] = [
    {
      name: "Difficulty",
      value: [
        `**${formatStars(stars)}★** · ${formatMods(options.mods)}`,
        `CS ${formatStat(attrs?.cs ?? map.cs)} · AR ${formatStat(attrs?.ar ?? map.ar)} · OD ${formatStat(attrs?.od ?? map.od)} · HP ${formatStat(attrs?.hp ?? map.hp)}`,
      ].join("\n"),
      inline: true,
    },
    {
      name: "Length",
      value: [
        `${formatDuration(map.lengthSeconds / rate)} · ${formatBpm(map.bpm * rate)} BPM`,
        `${map.maxCombo !== null ? `x${formatInt(attrs?.maxCombo ?? map.maxCombo)} · ` : ""}${map.status ?? "unknown"}`,
      ].join("\n"),
      inline: true,
    },
  ];
  if (options.pps && options.pps.length > 0) {
    fields.push({
      name: "pp",
      value: options.pps
        .map(({ accuracy, pp }) => `${accuracy}% **${Math.round(pp)}**`)
        .join(" · "),
    });
  }
  return card({
    author: {
      name: `Mapped by ${map.creator}`,
      ...(map.creatorId ? { url: userUrl(map.creatorId) } : {}),
    },
    title: truncate(`${map.artist} - ${map.title} [${map.version}]`, 256),
    url: beatmapUrl(map.beatmapId),
    fields,
    image: { url: coverUrl(map.beatmapsetId, "cover@2x") },
  });
};

/**
 * @function leaderboardEmbed
 * @param map {BeatmapDetail} the difficulty
 * @param scores {readonly OsuScore[]} one page, with users
 * @param options {{ start: number; page: number; pages: number; mods: string | null }}
 * @returns {APIEmbed} a leaderboard page
 */
export const leaderboardEmbed = (
  map: BeatmapDetail,
  scores: readonly OsuScore[],
  options: { start: number; page: number; pages: number; mods: string | null },
): APIEmbed =>
  card({
    title: truncate(`${map.artist} - ${map.title} [${map.version}]`, 256),
    url: beatmapUrl(map.beatmapId),
    thumbnail: { url: coverUrl(map.beatmapsetId, "list@2x") },
    description:
      [
        options.mods
          ? `-# Only ${options.mods} scores from the global top 100`
          : "-# Global top 100",
        ...scores.map((score, i) => {
          const name = score.user
            ? `${flag(score.user.countryCode)} **${escapeMarkdown(score.user.username)}**`
            : "**?**";
          return `\`#${String(options.start + i + 1).padStart(2, " ")}\` ${name} · ${GRADE_TEXT[score.rank]} · ${formatMods(score.mods)} · ${formatPp(score.pp)} · ${formatAccuracy(score.accuracy)} · x${formatInt(score.maxCombo)}`;
        }),
      ].join("\n") || "No scores.",
    footer: {
      text: options.pages > 1 ? `Page ${options.page} of ${options.pages} · harumin` : "harumin",
    },
  });

/** One side of /compare. */
export type CompareSide = { profile: OsuUserProfile; top: readonly OsuScore[] };

/**
 * @function compareEmbed
 * @param a {CompareSide} the first player
 * @param b {CompareSide} the second
 * @param ruleset {Ruleset} the ruleset compared
 * @returns {APIEmbed} the two side by side, the better number bold
 */
export const compareEmbed = (a: CompareSide, b: CompareSide, ruleset: Ruleset): APIEmbed => {
  const row = (
    label: string,
    x: number,
    y: number,
    show: (n: number) => string,
    lowerWins = false,
  ) => {
    const aWins = lowerWins ? x < y : x > y;
    const bWins = lowerWins ? y < x : y > x;
    return `${aWins ? `**${show(x)}**` : show(x)} · ${label} · ${bWins ? `**${show(y)}**` : show(y)}`;
  };
  const sa = a.profile.statistics;
  const sb = b.profile.statistics;
  const topPp = (side: CompareSide) => side.top[0]?.pp ?? 0;
  const rank = (n: number | null) => (n ? n : Number.MAX_SAFE_INTEGER);
  const showRank = (n: number) => (n === Number.MAX_SAFE_INTEGER ? "—" : `#${formatInt(n)}`);
  return card({
    title: `${a.profile.username} vs ${b.profile.username}`,
    description: [
      `-# ${RULESET_NAMES[ruleset]}`,
      row("rank", rank(sa.globalRank), rank(sb.globalRank), showRank, true),
      row("pp", sa.pp, sb.pp, (n) => formatInt(Math.round(n))),
      row("accuracy", sa.accuracy, sb.accuracy, (n) => `${n.toFixed(2)}%`),
      row("top play", topPp(a), topPp(b), (n) => `${Math.round(n)}pp`),
      row("plays", sa.playCount, sb.playCount, formatInt),
      row("play time", sa.playTime, sb.playTime, formatPlayTime),
      row("max combo", sa.maxCombo, sb.maxCombo, formatInt),
      row("SS", sa.grades.ss + sa.grades.ssh, sb.grades.ss + sb.grades.ssh, formatInt),
    ].join("\n"),
  });
};

/**
 * @function simulateEmbed
 * @param map {BeatmapDetail} the difficulty
 * @param result {{ pp: number; stars: number; maxCombo: number }} rosu's answer
 * @param input {{ mods: string; accuracy?: number; combo?: number; misses?: number }} what was asked
 * @returns {APIEmbed} the made-up score
 */
export const simulateEmbed = (
  map: BeatmapDetail,
  result: { pp: number; stars: number; maxCombo: number },
  input: {
    mods: string;
    accuracy?: number | undefined;
    combo?: number | undefined;
    misses?: number | undefined;
  },
): APIEmbed =>
  card({
    title: truncate(`${map.artist} - ${map.title} [${map.version}]`, 256),
    url: beatmapUrl(map.beatmapId),
    thumbnail: { url: coverUrl(map.beatmapsetId, "list@2x") },
    description: [
      `-# If you played it like this`,
      `**${formatPp(result.pp)}** · ${input.mods} · ${formatStars(result.stars)}★`,
      `${input.accuracy !== undefined ? `${input.accuracy}%` : "100%"} · x${formatInt(input.combo ?? result.maxCombo)}/${formatInt(result.maxCombo)} · ${input.misses ?? 0} miss${(input.misses ?? 0) === 1 ? "" : "es"}`,
    ].join("\n"),
  });
