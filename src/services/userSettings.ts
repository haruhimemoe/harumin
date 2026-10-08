/**
 * @file src/services/userSettings.ts
 * @desc Each player's card settings (accent, cover, favorite map) from harumin's user_settings,
 *       written by harumin.haruhime.moe's "Your card" page. Cached 10 minutes per osu! id, misses
 *       too; the site's POST /users/revalidate drops one at once. A failed read answers the
 *       defaults and isn't cached.
 * @author David @dvhsh (https://dvh.sh)
 * @created Thu Oct 8, 2026
 * @modified Thu Oct 8, 2026
 */

import {
  HARUMIN_COLLECTIONS,
  readUserSettings,
  type UserSettings,
} from "@haruhimemoe/harumin-config";
import type { Db } from "mongodb";
import { createTtlCache } from "./cache.ts";

/** How long a player's settings are kept. */
export const USER_SETTINGS_TTL_MS = 10 * 60_000;

/** The cached reader. */
export type UserSettingsStore = {
  get: (osuId: number) => Promise<UserSettings>;
  drop: (osuId: number) => void;
};

/**
 * @function createUserSettings
 * @param load {(osuId: number) => Promise<unknown>} reads the stored document (null if none)
 * @param now {() => number} clock (tests)
 * @returns {UserSettingsStore} the cached reader
 */
export const createUserSettings = (
  load: (osuId: number) => Promise<unknown>,
  now: () => number = Date.now,
): UserSettingsStore => {
  const cache = createTtlCache<number, UserSettings>(USER_SETTINGS_TTL_MS, 50_000, now);
  return {
    async get(osuId) {
      const hit = cache.get(osuId);
      if (hit) return hit;
      try {
        const settings = readUserSettings(osuId, await load(osuId));
        cache.set(osuId, settings);
        return settings;
      } catch {
        return readUserSettings(osuId, null);
      }
    },
    drop: (osuId) => cache.delete(osuId),
  };
};

/**
 * @function mongoUserSettingsLoader
 * @param db {Db} harumin's database
 * @returns {(osuId: number) => Promise<unknown>} reads user_settings by osuId
 */
export const mongoUserSettingsLoader = (db: Db) => (osuId: number) =>
  db.collection(HARUMIN_COLLECTIONS.userSettings).findOne({ osuId }, { projection: { _id: 0 } });
