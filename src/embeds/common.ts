/**
 * @file src/embeds/common.ts
 * @desc The pieces every embed shares: the pink accent, the footer, and short notice and error
 *       embeds. Embeds are plain APIEmbed objects, built from data and never from a client, so
 *       tests read them directly.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import type { APIEmbed } from "discord.js";
import { COLORS } from "../constants.ts";

/** The footer on cards: the bot's name, quiet. */
export const FOOTER = Object.freeze({ text: "harumin" });

/**
 * @function card
 * @param embed {APIEmbed} the content
 * @returns {APIEmbed} with the accent color and footer, unless the embed sets its own
 */
export const card = (embed: APIEmbed): APIEmbed => ({
  color: COLORS.pink,
  footer: FOOTER,
  ...embed,
});

/**
 * @function notice
 * @param text {string} one or two short sentences
 * @returns {APIEmbed} a plain notice
 */
export const notice = (text: string): APIEmbed => ({ color: COLORS.pink, description: text });

/**
 * @function problem
 * @param text {string} what went wrong and what to do
 * @returns {APIEmbed} a red notice
 */
export const problem = (text: string): APIEmbed => ({ color: COLORS.bad, description: text });
