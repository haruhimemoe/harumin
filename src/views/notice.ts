/**
 * @file src/views/notice.ts
 * @desc An error or confirmation's text as a notice card's runs: **bold** and `code` kept,
 *       channel and user mentions written as #name and @name. Text an image can't carry well (a
 *       link to click, a mention whose name isn't known, too long) gives null, and the reply
 *       stays a text embed.
 * @author David @dvhsh (https://dvh.sh)
 * @created Sat Oct 10, 2026
 * @modified Sat Oct 10, 2026
 */

import { MAX_NOTICE_LENGTH, type NoticeCard } from "@haruhimemoe/harumin-config";

/** Names for mentions: a channel's or a user's, or undefined when unknown. */
export type MentionNames = {
  channel: (id: string) => string | undefined;
  user: (id: string) => string | undefined;
};

const TOKENS = /(\*\*[^*]+\*\*|`[^`]+`|<#\d{17,20}>|<@!?\d{17,20}>)/;

/**
 * @function noticeParts
 * @param text {string} the notice's Discord markdown
 * @param names {MentionNames} mention names
 * @returns {NoticeCard["parts"] | null} the runs, or null when it should stay text
 */
export const noticeParts = (text: string, names: MentionNames): NoticeCard["parts"] | null => {
  if (/https?:\/\/|\]\(/.test(text)) return null;
  const parts: NoticeCard["parts"] = [];
  for (const piece of text.split(TOKENS)) {
    if (!piece) continue;
    if (piece.startsWith("**")) {
      parts.push({ text: piece.slice(2, -2), style: "bold" });
    } else if (piece.startsWith("`")) {
      parts.push({ text: piece.slice(1, -1), style: "code" });
    } else if (piece.startsWith("<#")) {
      const name = names.channel(piece.slice(2, -1));
      if (!name) return null;
      parts.push({ text: `#${name}`, style: "bold" });
    } else if (piece.startsWith("<@")) {
      const name = names.user(piece.replace(/[<@!>]/g, ""));
      if (!name) return null;
      parts.push({ text: `@${name}`, style: "bold" });
    } else {
      parts.push({ text: piece, style: "plain" });
    }
  }
  const length = parts.reduce((sum, part) => sum + part.text.length, 0);
  return parts.length && length <= MAX_NOTICE_LENGTH ? parts : null;
};
