/**
 * @file src/embeds/tools.ts
 * @desc Cards for the haruhime tools: packs, pools (and pack keys, which are pools in a string),
 *       a pool's content-rules check, a parsed pool, a match summary and a bb template preview.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import type { ComplianceVerdict } from "@haruhimemoe/compliance";
import { verdictText } from "@haruhimemoe/compliance";
import type { BeatmapMeta, OsuMatch } from "@haruhimemoe/osu";
import { formatRange, formatStars } from "@haruhimemoe/osu/format";
import { listGames } from "@haruhimemoe/osu/match";
import { beatmapUrl } from "@haruhimemoe/osu/shapes";
import { type SlotLineError, slotLabel } from "@haruhimemoe/pool";
import type { APIEmbed } from "discord.js";
import { COLORS, LINKS } from "../constants.ts";
import { escapeMarkdown, formatInt, truncate } from "../utils/format.ts";
import { card } from "./common.ts";

/** A slot as the cards read it. */
export type CardSlot = { mod: string | null; index: number; beatmapId: number };

/**
 * @function bucketCounts
 * @param slots {readonly CardSlot[]} a pool's slots
 * @returns {string} "NM 6 · HD 3 · HR 3 · DT 4 · FM 3 · TB 1", in first-seen order
 */
export const bucketCounts = (slots: readonly CardSlot[]): string => {
  const counts = new Map<string, number>();
  for (const slot of slots) counts.set(slot.mod ?? "—", (counts.get(slot.mod ?? "—") ?? 0) + 1);
  return [...counts.entries()].map(([mod, count]) => `${mod} ${count}`).join(" · ");
};

/**
 * @function starSpan
 * @param slots {readonly CardSlot[]} slots
 * @param maps {ReadonlyMap<number, BeatmapMeta>} metadata found for them
 * @returns {string | null} "4.50–6.20★", or null with no metadata
 */
export const starSpan = (
  slots: readonly CardSlot[],
  maps: ReadonlyMap<number, BeatmapMeta>,
): string | null => {
  const stars = slots
    .map((slot) => maps.get(slot.beatmapId)?.starRating)
    .filter((n): n is number => n !== undefined);
  if (stars.length === 0) return null;
  return `${formatRange(Math.min(...stars), Math.max(...stars), formatStars)}★`;
};

/**
 * @function slotList
 * @param slots {readonly CardSlot[]} slots in pool order
 * @param maps {ReadonlyMap<number, BeatmapMeta>} metadata
 * @param max {number} the most lines
 * @returns {string} "`NM1` [Artist - Title [Diff]](link) 5.23★" lines
 */
export const slotList = (
  slots: readonly CardSlot[],
  maps: ReadonlyMap<number, BeatmapMeta>,
  max = 20,
): string => {
  const lines = slots.slice(0, max).map((slot) => {
    const meta = maps.get(slot.beatmapId);
    const name = meta
      ? escapeMarkdown(truncate(`${meta.artist} - ${meta.title} [${meta.version}]`, 60))
      : `#${slot.beatmapId}`;
    return `\`${slotLabel(slot).padEnd(4, " ")}\` [${name}](${beatmapUrl(slot.beatmapId)})${meta ? ` ${formatStars(meta.starRating)}★` : ""}`;
  });
  if (slots.length > max) lines.push(`-# and ${slots.length - max} more`);
  return lines.join("\n");
};

/**
 * @function poolCardEmbed
 * @param pool {{ name: string; slots: readonly CardSlot[]; url: string; kind: "pack" | "pool"; subtitle?: string; description?: string }}
 * @param maps {ReadonlyMap<number, BeatmapMeta>} metadata for its maps
 * @returns {APIEmbed} the pack or pool card
 */
export const poolCardEmbed = (
  pool: {
    name: string;
    slots: readonly CardSlot[];
    url: string;
    kind: "pack" | "pool";
    subtitle?: string | undefined;
    description?: string | undefined;
  },
  maps: ReadonlyMap<number, BeatmapMeta>,
): APIEmbed => {
  const span = starSpan(pool.slots, maps);
  return card({
    author: {
      name: pool.kind === "pack" ? "packs.haruhime.moe" : "pools.haruhime.moe",
      url: pool.kind === "pack" ? LINKS.packs : LINKS.pools,
    },
    title: truncate(pool.name || "Untitled", 256),
    url: pool.url,
    description: truncate(
      [
        pool.subtitle ? `-# ${pool.subtitle}` : "",
        pool.description ? truncate(pool.description, 300) : "",
        `**${formatInt(pool.slots.length)}** map${pool.slots.length === 1 ? "" : "s"}${span ? ` · ${span}` : ""} · ${bucketCounts(pool.slots)}`,
        "",
        slotList(pool.slots, maps),
      ]
        .filter((line, i) => line !== "" || i === 3)
        .join("\n"),
      4096,
    ),
  });
};

/** One map's verdict in /pool check. */
export type CheckRow = {
  slot: CardSlot;
  meta: BeatmapMeta | undefined;
  verdict: ComplianceVerdict | null;
};

/**
 * @function poolCheckEmbed
 * @param name {string} the pool
 * @param rows {readonly CheckRow[]} every map's verdict (null: osu! didn't answer for it)
 * @returns {APIEmbed} green when every map is allowed, yellow or red otherwise, listing the rest
 */
export const poolCheckEmbed = (name: string, rows: readonly CheckRow[]): APIEmbed => {
  const bad = rows.filter((row) => row.verdict?.status === "disallowed");
  const maybe = rows.filter((row) => row.verdict?.status === "potential");
  const unknown = rows.filter((row) => row.verdict === null);
  const line = (row: CheckRow) =>
    `\`${slotLabel(row.slot).padEnd(4, " ")}\` ${row.meta ? escapeMarkdown(truncate(`${row.meta.artist} - ${row.meta.title}`, 60)) : `#${row.slot.beatmapId}`}${row.verdict ? ` · ${verdictText(row.verdict)}` : ""}`;
  return {
    color:
      bad.length > 0
        ? COLORS.bad
        : maybe.length > 0 || unknown.length > 0
          ? COLORS.warn
          : COLORS.ok,
    title: truncate(`Content rules · ${name || "Untitled"}`, 256),
    url: "https://osu.ppy.sh/wiki/en/Rules/Content_usage_permissions",
    description: truncate(
      [
        bad.length === 0 && maybe.length === 0 && unknown.length === 0
          ? `All ${rows.length} maps are fine for officially supported tournaments.`
          : `${rows.length - bad.length - maybe.length - unknown.length} of ${rows.length} maps are fine.`,
        bad.length ? `\n**Not allowed**\n${bad.map(line).join("\n")}` : "",
        maybe.length ? `\n**Needs a closer look**\n${maybe.map(line).join("\n")}` : "",
        unknown.length ? `\n**Couldn't check**\n${unknown.map(line).join("\n")}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      4096,
    ),
    footer: { text: "osu! content usage rules, via @haruhimemoe/compliance · harumin" },
  };
};

/**
 * @function parsedPoolEmbed
 * @param slots {readonly CardSlot[]} what was read
 * @param errors {readonly SlotLineError[]} lines that weren't
 * @param packKeyUrl {string | null} a packs.haruhime.moe/k link holding it
 * @returns {APIEmbed} the pool as read, with problems listed
 */
export const parsedPoolEmbed = (
  slots: readonly CardSlot[],
  errors: readonly SlotLineError[],
  packKeyUrl: string | null,
): APIEmbed =>
  card({
    title: `Read ${slots.length} map${slots.length === 1 ? "" : "s"}`,
    ...(packKeyUrl ? { url: packKeyUrl } : {}),
    description: truncate(
      [
        slots.length ? `${bucketCounts(slots)}` : "",
        slots
          .map((slot) => `\`${slotLabel(slot).padEnd(4, " ")}\` ${beatmapUrl(slot.beatmapId)}`)
          .join("\n"),
        errors.length
          ? `\n**Skipped**\n${errors
              .slice(0, 10)
              .map((error) => `Line ${error.line}: ${error.reason}`)
              .join("\n")}`
          : "",
        packKeyUrl
          ? `\n[Open as a pack](${packKeyUrl}) · [Build it on pools](${LINKS.pools}/new)`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
      4096,
    ),
  });

/**
 * @function matchSummaryEmbed
 * @param match {OsuMatch} a match
 * @returns {APIEmbed} name, games played, players, and a hint for /matchcost
 */
export const matchSummaryEmbed = (match: OsuMatch): APIEmbed =>
  card({
    author: { name: "osu! multiplayer" },
    title: truncate(match.name, 256),
    url: `https://osu.ppy.sh/community/matches/${match.id}`,
    description: [
      `${listGames(match).length} games · ${match.users.length} players${match.endTime ? "" : " · still open"}`,
      "-# The button below works out match costs.",
    ].join("\n"),
  });

/**
 * @function bbPreviewEmbed
 * @param templateId {string} the template
 * @returns {APIEmbed} a small pointer card (bb renders its own previews)
 */
export const bbPreviewEmbed = (templateId: string): APIEmbed =>
  card({
    author: { name: "bb.haruhime.moe", url: LINKS.bb },
    title: "BBCode template",
    url: `${LINKS.bb}/t/${templateId}`,
    description: "An osu! BBCode template. Open it to preview, copy or remix.",
  });
