/**
 * @file src/constants.ts
 * @desc Fixed values: version, colors, links, limits and the invite permissions.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import pkg from "../package.json" with { type: "json" };

/** The bot's version, from package.json. */
export const VERSION: string = pkg.version;

/** Sent to osu! with every request. */
export const USER_AGENT = `harumin/${pkg.version} (+https://harumin.haruhime.moe)`;

/** Embed colors. Pink is the brand's own (#ff66ab). */
export const COLORS = Object.freeze({
  pink: 0xff66ab,
  ink: 0x1f1a1d,
  ok: 0x7dd87d,
  warn: 0xffcc22,
  bad: 0xff6670,
});

/** Links shown in /info, /help and footers. */
export const LINKS = Object.freeze({
  site: "https://harumin.haruhime.moe",
  commands: "https://harumin.haruhime.moe/commands",
  dashboard: "https://harumin.haruhime.moe/dashboard",
  support: "https://haruhime.moe/discord",
  source: "https://github.com/haruhimemoe/harumin",
  packs: "https://packs.haruhime.moe",
  pools: "https://pools.haruhime.moe",
  bb: "https://bb.haruhime.moe",
});

/**
 * What the invite asks for: View Channels, Send Messages, Embed Links, Attach Files, Read Message
 * History, Use External Emojis. Nothing that moderates.
 */
export const INVITE_PERMISSIONS = 1024n + 2048n + 16384n + 32768n + 65536n + 262144n;

/**
 * @function inviteUrl
 * @param clientId {string} the application id
 * @returns {string} the bot's install link with slash commands
 */
export const inviteUrl = (clientId: string): string =>
  `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot+applications.commands&permissions=${INVITE_PERMISSIONS}`;

/** Scores per page in /top and /leaderboard. */
export const PAGE_SIZE = 5;
/** How long a channel remembers the last map, match, pack or pool. */
export const CONTEXT_TTL_MS = 30 * 60_000;
/** Same link in the same channel within this window gets one card. */
export const EMBED_DEDUPE_MS = 60_000;
/** How long a guild's settings stay cached. */
export const SETTINGS_TTL_MS = 60_000;
/** harumin's own database (settings, tracks, member records): the same name the site reads. */
export const DB_NAME = "harumin";

/** The hub's identity database, read-only. Named here, not taken from the URI, like every app. */
export const IDENTITY_DB_NAME = "identity";

/** How long a Discord to osu! link stays cached. */
export const LINK_TTL_MS = 5 * 60_000;
