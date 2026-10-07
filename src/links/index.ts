/**
 * @file src/links/index.ts
 * @desc Finds the links harumin knows in a message: osu! beatmaps and matches, packs.haruhime.moe
 *       packs and pack keys, pools.haruhime.moe pools and bb.haruhime.moe templates. Every URL is
 *       parsed with URL against an exact host allowlist; nothing is fetched here. A message gives
 *       at most MAX_LINKS_PER_MESSAGE refs, duplicates dropped, in the order they appear.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import type { AutoEmbedKey } from "@haruhimemoe/harumin-config";
import { parseMatchId } from "@haruhimemoe/osu/shapes";
import { extractPackKey } from "@haruhimemoe/pool";

/** One link harumin can answer. */
export type LinkRef =
  | { key: "map"; beatmapId: number }
  | { key: "match"; matchId: number }
  | { key: "pack"; slug: string }
  | { key: "packKey"; packKey: string }
  | { key: "pool"; poolId: string }
  | { key: "bb"; templateId: string };

/** The most cards one message can get. */
export const MAX_LINKS_PER_MESSAGE = 3;

const URL_IN_TEXT = /https?:\/\/[^\s<>()]+/gi;
const OSU_HOSTS = new Set(["osu.ppy.sh", "old.ppy.sh"]);
const RULESET_FRAGMENT = /^#(?:osu|taiko|fruits|mania)\/(\d+)$/;
const DIGITS = /^\d{1,10}$/;
const PACK_SLUG = /^[A-Za-z0-9_-]{10}$/;
const POOL_ID = /^[A-Za-z0-9_-]{6,40}$/;
const BB_ID = /^[A-Za-z0-9_-]{6,40}$/;

const positiveId = (text: string | undefined): number | null => {
  if (!text || !DIGITS.test(text)) return null;
  const id = Number(text);
  return id > 0 && id <= 2_147_483_647 ? id : null;
};

/**
 * @function beatmapIdFromUrl
 * @param url {URL} a parsed link
 * @returns {number | null} the difficulty id of an osu! beatmap link (/b/, /beatmaps/, or a set
 *          link with #ruleset/id), else null. A set link without a difficulty is null.
 */
export const beatmapIdFromUrl = (url: URL): number | null => {
  if (!OSU_HOSTS.has(url.hostname.toLowerCase())) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if ((parts[0] === "b" || parts[0] === "beatmaps") && parts.length >= 2) {
    return positiveId(parts[1]);
  }
  if (parts[0] === "beatmapsets" && parts.length >= 2) {
    if (parts.length >= 3) return positiveId(parts[2]);
    return positiveId(RULESET_FRAGMENT.exec(url.hash)?.[1]);
  }
  if (parts[0] === "p" && parts[1] === "beatmap")
    return positiveId(url.searchParams.get("b") ?? "");
  return null;
};

/**
 * @function parseMapInput
 * @param input {string} a beatmap id or link, as typed into an option
 * @returns {number | null} the difficulty id
 */
export const parseMapInput = (input: string): number | null => {
  const text = input.trim();
  if (DIGITS.test(text)) return positiveId(text);
  try {
    return beatmapIdFromUrl(new URL(text.startsWith("http") ? text : `https://${text}`));
  } catch {
    return null;
  }
};

/**
 * @function refFromUrl
 * @param url {URL} a parsed link
 * @returns {LinkRef | null} what it points at, or null for a link harumin doesn't answer
 */
export const refFromUrl = (url: URL): LinkRef | null => {
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);
  if (OSU_HOSTS.has(host)) {
    const beatmapId = beatmapIdFromUrl(url);
    if (beatmapId) return { key: "map", beatmapId };
    const matchId = parseMatchId(url.href);
    return matchId ? { key: "match", matchId } : null;
  }
  if (host === "packs.haruhime.moe") {
    if (parts[0] === "p" && parts[1] && PACK_SLUG.test(parts[1]))
      return { key: "pack", slug: parts[1] };
    const packKey = extractPackKey(url.hash);
    return parts[0] === "k" && packKey ? { key: "packKey", packKey } : null;
  }
  if (host === "pools.haruhime.moe" && parts[0] === "pools" && parts[1] && POOL_ID.test(parts[1])) {
    return { key: "pool", poolId: parts[1] };
  }
  if (host === "bb.haruhime.moe" && parts[0] === "t" && parts[1] && BB_ID.test(parts[1])) {
    return { key: "bb", templateId: parts[1] };
  }
  return null;
};

/**
 * @function findLinks
 * @param content {string} a message's text
 * @returns {LinkRef[]} the refs found (bare pack keys too), at most MAX_LINKS_PER_MESSAGE
 */
export const findLinks = (content: string): LinkRef[] => {
  const refs: LinkRef[] = [];
  const seen = new Set<string>();
  const add = (ref: LinkRef) => {
    const id = JSON.stringify(ref);
    if (seen.has(id) || refs.length >= MAX_LINKS_PER_MESSAGE) return;
    seen.add(id);
    refs.push(ref);
  };
  for (const match of content.matchAll(URL_IN_TEXT)) {
    try {
      const ref = refFromUrl(new URL(match[0]));
      if (ref) add(ref);
    } catch {
      // Not a URL after all.
    }
  }
  const withoutUrls = content.replace(URL_IN_TEXT, " ");
  const packKey = extractPackKey(withoutUrls);
  if (packKey) add({ key: "packKey", packKey });
  return refs;
};

/**
 * @function settingFor
 * @param ref {LinkRef} a found link
 * @returns {AutoEmbedKey} the dashboard toggle that decides whether it gets a card
 */
export const settingFor = (ref: LinkRef): AutoEmbedKey =>
  ref.key === "packKey" ? "pack" : ref.key;

/**
 * @function refId
 * @param ref {LinkRef} a found link
 * @returns {string} a stable id for dedupe ("map:75")
 */
export const refId = (ref: LinkRef): string => {
  switch (ref.key) {
    case "map":
      return `map:${ref.beatmapId}`;
    case "match":
      return `match:${ref.matchId}`;
    case "pack":
      return `pack:${ref.slug}`;
    case "packKey":
      return `packKey:${ref.packKey}`;
    case "pool":
      return `pool:${ref.poolId}`;
    case "bb":
      return `bb:${ref.templateId}`;
  }
};
