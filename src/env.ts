/**
 * @file src/env.ts
 * @desc The bot's environment, checked once at start. A missing or malformed value stops the bot
 *       with the variable's name, never its value.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { snowflakeSchema } from "@haruhimemoe/harumin-config";
import { z } from "zod";

const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

/** The variables harumin reads. */
export const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: snowflakeSchema,
  DEV_GUILD_ID: snowflakeSchema,
  OWNER_ID: snowflakeSchema,
  OSU_CLIENT_ID: z.string().min(1),
  OSU_CLIENT_SECRET: z.string().min(1),
  OSU_RATE_PER_MINUTE: z.coerce.number().int().min(10).max(1200).default(120),
  MONGODB_URI: z.string().startsWith("mongodb"),
  IDENTITY_MONGODB_URI: z.string().startsWith("mongodb"),
  HUB_URL: z.url().default("https://haruhime.moe"),
  SITE_URL: z.url().default("https://harumin.haruhime.moe"),
  HARUMIN_SERVICE_TOKEN: z.string().min(32),
  SERVICE_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  CACHE_DIR: z.string().min(1).default(".cache/osu"),
  TOPGG_TOKEN: z.preprocess(blankToUndefined, z.string().min(1).optional()),
});

/** The parsed environment. */
export type Env = z.infer<typeof envSchema>;

/**
 * @function loadEnv
 * @param source {Record<string, string | undefined>} process.env or a copy
 * @returns {Env} the parsed values
 * @throws {Error} naming each bad variable (never its value)
 */
export const loadEnv = (source: Record<string, string | undefined>): Env => {
  const parsed = envSchema.safeParse(source);
  if (parsed.success) return parsed.data;
  const names = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
  throw new Error(`harumin: missing or invalid env: ${names.join(", ")}`);
};
