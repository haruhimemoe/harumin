/**
 * @file src/utils/format.ts
 * @desc Display text shared by the embeds: numbers with separators, grades, ruleset names, hit
 *       counts per ruleset, fail completion, play time, flags and Discord timestamps.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import type { Ruleset } from "@haruhimemoe/harumin-config";
import type { OsuScore, ScoreRank } from "@haruhimemoe/osu";

const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const twoDecimals = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * @function formatInt
 * @param value {number} a count
 * @returns {string} "1,234,567"
 */
export const formatInt = (value: number): string => integer.format(value);

/**
 * @function formatPp
 * @param pp {number | null} performance points
 * @returns {string} "312.45pp", or "no pp" when osu! gave none (unranked, failed)
 */
export const formatPp = (pp: number | null): string =>
  pp === null ? "no pp" : `${twoDecimals.format(pp)}pp`;

/** What each ruleset is called in text. */
export const RULESET_NAMES: Readonly<Record<Ruleset, string>> = Object.freeze({
  osu: "osu!",
  taiko: "osu!taiko",
  fruits: "osu!catch",
  mania: "osu!mania",
});

/** The `mode` option's choices, shared by every command. */
export const RULESET_CHOICES = [
  { name: "osu!", value: "osu" },
  { name: "taiko", value: "taiko" },
  { name: "catch", value: "fruits" },
  { name: "mania", value: "mania" },
] as const;

/** How each grade reads. */
export const GRADE_TEXT: Readonly<Record<ScoreRank, string>> = Object.freeze({
  XH: "SS+",
  X: "SS",
  SH: "S+",
  S: "S",
  A: "A",
  B: "B",
  C: "C",
  D: "D",
  F: "F",
});

/** Statistic names in display order for each ruleset. */
const HIT_KEYS: Readonly<Record<Ruleset, readonly string[]>> = Object.freeze({
  osu: ["great", "ok", "meh", "miss"],
  taiko: ["great", "ok", "miss"],
  fruits: ["great", "large_tick_hit", "small_tick_hit", "small_tick_miss", "miss"],
  mania: ["perfect", "great", "good", "ok", "meh", "miss"],
});

/**
 * @function formatHits
 * @param statistics {Record<string, number>} a score's judgement counts
 * @param ruleset {Ruleset} the score's ruleset
 * @returns {string} "[300/4/0/1]" with the ruleset's judgements in order (missing ones are 0)
 */
export const formatHits = (statistics: Record<string, number>, ruleset: Ruleset): string =>
  `[${HIT_KEYS[ruleset].map((key) => statistics[key] ?? 0).join("/")}]`;

/** The judgements that count an object as passed for completion. */
const OBJECT_KEYS = ["perfect", "great", "good", "ok", "meh", "miss"] as const;

/**
 * @function completion
 * @param score {Pick<OsuScore, "statistics" | "maximumStatistics">} a (failed) score
 * @returns {number | null} percent of the map played, or null when osu! sent no maximum
 */
export const completion = (
  score: Pick<OsuScore, "statistics" | "maximumStatistics">,
): number | null => {
  if (!score.maximumStatistics) return null;
  const sum = (stats: Record<string, number>) =>
    OBJECT_KEYS.reduce((total, key) => total + (stats[key] ?? 0), 0);
  const total = sum(score.maximumStatistics);
  if (total === 0) return null;
  return Math.min(100, (sum(score.statistics) / total) * 100);
};

/**
 * @function formatPlayTime
 * @param seconds {number} total play time
 * @returns {string} "321h 12m"
 */
export const formatPlayTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${formatInt(hours)}h ${minutes}m`;
};

/**
 * @function flag
 * @param countryCode {string | null} two letters
 * @returns {string} the flag emoji, or "" for none or a malformed code
 */
export const flag = (countryCode: string | null): string => {
  if (!countryCode || !/^[A-Za-z]{2}$/.test(countryCode)) return "";
  return String.fromCodePoint(
    ...[...countryCode.toUpperCase()].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65),
  );
};

/**
 * @function discordTime
 * @param iso {string | Date} a time
 * @param style {"R" | "f" | "D"} relative, full, or date
 * @returns {string} a <t:…> tag Discord shows in each viewer's own timezone
 */
export const discordTime = (iso: string | Date, style: "R" | "f" | "D" = "R"): string =>
  `<t:${Math.floor(new Date(iso).getTime() / 1000)}:${style}>`;

/**
 * @function escapeMarkdown
 * @param text {string} a player or map name
 * @returns {string} the text with Discord markdown characters escaped
 */
export const escapeMarkdown = (text: string): string => text.replace(/([\\*_`~|>[\]()])/g, "\\$1");

/**
 * @function truncate
 * @param text {string} anything
 * @param max {number} the most characters
 * @returns {string} the text, cut with an ellipsis when longer
 */
export const truncate = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`;
