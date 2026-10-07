/**
 * @file src/utils/mods.ts
 * @desc Mods typed into an option ("HDDT", "+hd dt", "NM") and the filters /top and /leaderboard
 *       apply with them. Classic (CL) never counts for or against a filter, and NC counts as DT,
 *       PF as SD, so "DT" finds nightcore plays too.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import type { OsuMod } from "@haruhimemoe/osu";

/** Mods osu! has, as acronyms. Anything else typed is refused. */
export const KNOWN_MODS = new Set([
  "EZ",
  "NF",
  "HT",
  "DC",
  "HR",
  "SD",
  "PF",
  "DT",
  "NC",
  "HD",
  "FI",
  "FL",
  "BL",
  "ST",
  "AC",
  "TP",
  "DA",
  "CL",
  "RD",
  "MR",
  "AL",
  "SG",
  "AT",
  "CN",
  "RX",
  "AP",
  "SO",
  "TC",
  "WG",
  "SI",
  "GR",
  "DF",
  "WU",
  "WD",
  "TR",
  "BR",
  "AD",
  "MU",
  "NS",
  "MG",
  "RP",
  "AS",
  "FR",
  "BU",
  "SY",
  "DP",
  "BM",
  "1K",
  "2K",
  "3K",
  "4K",
  "5K",
  "6K",
  "7K",
  "8K",
  "9K",
  "10K",
  "IN",
  "CS",
  "HO",
  "TD",
  "SV2",
]);

/**
 * @function parseModsInput
 * @param input {string} what was typed, e.g. "HDDT", "+hd,dt", "NM"
 * @returns {OsuMod[] | null} the mods (empty for NM), or null when something isn't a mod
 */
export const parseModsInput = (input: string): OsuMod[] | null => {
  const text = input.toUpperCase().replace(/[\s+,]/g, "");
  if (text === "" || text === "NM" || text === "NOMOD") return [];
  const mods: OsuMod[] = [];
  let rest = text;
  while (rest.length > 0) {
    const three = rest.slice(0, 3);
    const two = rest.slice(0, 2);
    const acronym = KNOWN_MODS.has(three) ? three : KNOWN_MODS.has(two) ? two : null;
    if (!acronym) return null;
    if (!mods.some((mod) => mod.acronym === acronym)) mods.push({ acronym });
    rest = rest.slice(acronym.length);
  }
  return mods;
};

const canonical = (acronym: string): string =>
  acronym === "NC" ? "DT" : acronym === "PF" ? "SD" : acronym;

const filterable = (mods: readonly { acronym: string }[]): Set<string> =>
  new Set(mods.map((mod) => canonical(mod.acronym)).filter((acronym) => acronym !== "CL"));

/**
 * @function matchesMods
 * @param scoreMods {readonly { acronym: string }[]} a score's mods
 * @param filter {readonly OsuMod[]} the filter (empty means no mods)
 * @returns {boolean} true when the score has every filter mod (or none at all, for NM)
 */
export const matchesMods = (
  scoreMods: readonly { acronym: string }[],
  filter: readonly OsuMod[],
): boolean => {
  const have = filterable(scoreMods);
  if (filter.length === 0) return have.size === 0;
  return [...filterable(filter)].every((acronym) => have.has(acronym));
};
