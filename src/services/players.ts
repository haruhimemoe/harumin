/**
 * @file src/services/players.ts
 * @desc Who a command is about. In order: a name (or profile link, or #id) typed in `name`; the
 *       linked account of the Discord user picked in `discord`; the caller's own link. Without
 *       any of those the command explains how to /link. Also picks the ruleset: the option, then
 *       the guild's default, then the player's own main mode (osu! answers with it when asked
 *       without one).
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import type { Ruleset } from "@haruhimemoe/harumin-config";
import type { Linking } from "./linking.ts";

/** Who to look up: an osu! id, or a name osu! resolves. */
export type PlayerRef = { kind: "id"; osuId: number } | { kind: "name"; name: string };

/** The answer: a player, or why there isn't one. */
export type PlayerResolution =
  | { ok: true; player: PlayerRef; linked: boolean }
  | { ok: false; reason: "self-unlinked" | "other-unlinked"; discordId: string };

const PROFILE_URL = /^(?:https?:\/\/)?(?:osu|old)\.ppy\.sh\/(?:users|u)\/(\d+)(?:[/?#].*)?$/i;
const HASH_ID = /^#(\d{1,10})$/;
/** osu! names: letters, digits, space, -, _, [ and ], 2 to 15 long (old accounts have 2). */
const USERNAME = /^[A-Za-z0-9 _\-[\]]{2,15}$/;

/**
 * @function parsePlayerInput
 * @param input {string} what was typed: a name, a profile link, or #id
 * @returns {PlayerRef | null} null for anything that can't be an osu! name, link or #id
 */
export const parsePlayerInput = (input: string): PlayerRef | null => {
  const text = input.trim();
  if (text === "" || text.length > 64) return null;
  const link = PROFILE_URL.exec(text) ?? HASH_ID.exec(text);
  if (link) return { kind: "id", osuId: Number(link[1]) };
  return USERNAME.test(text) ? { kind: "name", name: text } : null;
};

/**
 * @function resolvePlayer
 * @param query {{ name?: string | null; discordId?: string | null; callerId: string }} the options
 * @param linking {Linking} Discord to osu!
 * @returns {Promise<PlayerResolution>} the player, or which Discord user isn't linked
 */
export const resolvePlayer = async (
  query: {
    name?: string | null | undefined;
    discordId?: string | null | undefined;
    callerId: string;
  },
  linking: Pick<Linking, "get">,
): Promise<PlayerResolution> => {
  if (query.name) {
    const parsed = parsePlayerInput(query.name);
    if (parsed) return { ok: true, player: parsed, linked: false };
  }
  const discordId = query.discordId ?? query.callerId;
  const account = await linking.get(discordId);
  if (account) return { ok: true, player: { kind: "id", osuId: account.osuId }, linked: true };
  return {
    ok: false,
    reason: discordId === query.callerId ? "self-unlinked" : "other-unlinked",
    discordId,
  };
};

/**
 * @function playerKey
 * @param player {PlayerRef} a resolved player
 * @returns {number | string} what the osu! client's getUserProfile takes
 */
export const playerKey = (player: PlayerRef): number | string =>
  player.kind === "id" ? player.osuId : player.name;

/**
 * @function pickRuleset
 * @param option {string | null | undefined} the `mode` option
 * @param guildDefault {Ruleset | null} the guild's default
 * @returns {Ruleset | undefined} the ruleset to ask osu! for; undefined means "the player's own"
 */
export const pickRuleset = (
  option: string | null | undefined,
  guildDefault: Ruleset | null,
): Ruleset | undefined => {
  if (option === "osu" || option === "taiko" || option === "fruits" || option === "mania") {
    return option;
  }
  return guildDefault ?? undefined;
};
