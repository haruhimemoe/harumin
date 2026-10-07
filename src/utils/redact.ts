/**
 * @file src/utils/redact.ts
 * @desc Removes secrets from text before /eval shows it: every env value six characters or longer
 *       (tokens, secrets, connection strings), longest first so one secret inside another goes
 *       whole, plus anything shaped like a Discord bot token.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

const BOT_TOKEN = /[MNO][A-Za-z\d_-]{23,25}\.[A-Za-z\d_-]{6}\.[A-Za-z\d_-]{27,}/g;

/**
 * @function redact
 * @param text {string} output to show
 * @param secrets {Iterable<unknown>} the values to hide (env values; non-strings are skipped)
 * @returns {string} the text with each secret replaced by [redacted]
 */
export const redact = (text: string, secrets: Iterable<unknown>): string => {
  const values = [
    ...new Set(
      [...secrets].filter(
        (value): value is string => typeof value === "string" && value.length >= 6,
      ),
    ),
  ].sort((a, b) => b.length - a.length);
  let out = text;
  for (const value of values) out = out.split(value).join("[redacted]");
  return out.replace(BOT_TOKEN, "[redacted]");
};
