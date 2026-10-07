/**
 * @file src/services/settings.ts
 * @desc Each guild's settings, written by the dashboard and read here through harumin-config.
 *       Cached for a minute; the dashboard's revalidate call drops one guild at once. In DMs
 *       (no guild) everything is the defaults.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import {
  DEFAULT_AUTO_EMBEDS,
  type GuildSettings,
  HARUMIN_COLLECTIONS,
  readGuildSettings,
} from "@haruhimemoe/harumin-config";
import type { Db } from "mongodb";
import { SETTINGS_TTL_MS } from "../constants.ts";
import { createTtlCache } from "./cache.ts";

/** Settings for a guild, or DM defaults. */
export type EffectiveSettings = Pick<GuildSettings, "autoEmbeds" | "defaultMode">;

/** The cached reader. */
export type Settings = {
  get: (guildId: string | null) => Promise<EffectiveSettings>;
  invalidate: (guildId: string) => void;
};

/** DM settings: the defaults. */
export const DM_SETTINGS: EffectiveSettings = Object.freeze({
  autoEmbeds: { ...DEFAULT_AUTO_EMBEDS },
  defaultMode: null,
});

/**
 * @function createSettings
 * @param load {(guildId: string) => Promise<unknown>} reads the stored document (null if none)
 * @param now {() => number} clock (tests)
 * @returns {Settings} the cached reader; a failed read answers the defaults and isn't cached
 */
export const createSettings = (
  load: (guildId: string) => Promise<unknown>,
  now: () => number = Date.now,
): Settings => {
  const cache = createTtlCache<string, EffectiveSettings>(SETTINGS_TTL_MS, 50_000, now);
  return {
    async get(guildId) {
      if (!guildId) return DM_SETTINGS;
      const hit = cache.get(guildId);
      if (hit) return hit;
      try {
        const settings = readGuildSettings(guildId, await load(guildId));
        cache.set(guildId, settings);
        return settings;
      } catch {
        return readGuildSettings(guildId, null);
      }
    },
    invalidate: (guildId) => cache.delete(guildId),
  };
};

/**
 * @function mongoSettingsLoader
 * @param db {Db} harumin's database
 * @returns {(guildId: string) => Promise<unknown>} reads guild_settings by guildId
 */
export const mongoSettingsLoader = (db: Db) => (guildId: string) =>
  db.collection(HARUMIN_COLLECTIONS.guildSettings).findOne({ guildId }, { projection: { _id: 0 } });
