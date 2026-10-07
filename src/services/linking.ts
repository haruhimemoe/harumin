/**
 * @file src/services/linking.ts
 * @desc Discord account to osu! account, from the accounts hub. The hub owns the link (people
 *       link Discord on haruhime.moe/account); harumin reads the identity database with a
 *       read-only user, the same one-document query as next-kit's findUserByDiscordId: a banned
 *       user reads as unlinked. Answers are cached for a few minutes, misses too.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import type { Db } from "mongodb";
import { LINK_TTL_MS } from "../constants.ts";
import { createTtlCache } from "./cache.ts";

/** A linked osu! account. */
export type LinkedAccount = { osuId: number; username: string };

/** Looks one Discord id up; null when nobody linked it. */
export type LinkLookup = (discordId: string) => Promise<LinkedAccount | null>;

/** The cached reader. */
export type Linking = {
  get: (discordId: string) => Promise<LinkedAccount | null>;
  /** Many at once, for /server: only the linked ones come back. */
  getMany: (discordIds: readonly string[]) => Promise<Map<string, LinkedAccount>>;
};

type IdentityUser = {
  osuId?: number;
  username?: string;
  discordId?: string;
  bannedAt?: Date | null;
};

const DISCORD_ID = /^\d{1,20}$/;

/**
 * @function identityLookup
 * @param identityDb {Db} the identity database
 * @returns {LinkLookup} reads `user` by discordId; malformed ids and banned users read as null
 */
export const identityLookup =
  (identityDb: Db): LinkLookup =>
  async (discordId) => {
    if (!DISCORD_ID.test(discordId)) return null;
    const user = await identityDb
      .collection<IdentityUser>("user")
      .findOne({ discordId }, { projection: { osuId: 1, username: 1, bannedAt: 1 } });
    if (!user || user.bannedAt || typeof user.osuId !== "number" || !user.username) return null;
    return { osuId: user.osuId, username: user.username };
  };

/**
 * @function identityBatchLookup
 * @param identityDb {Db} the identity database
 * @returns {(ids: readonly string[]) => Promise<Map<string, LinkedAccount>>} one query for many
 */
export const identityBatchLookup =
  (identityDb: Db) =>
  async (discordIds: readonly string[]): Promise<Map<string, LinkedAccount>> => {
    const ids = discordIds.filter((id) => DISCORD_ID.test(id));
    const found = new Map<string, LinkedAccount>();
    if (ids.length === 0) return found;
    const users = identityDb
      .collection<IdentityUser>("user")
      .find(
        { discordId: { $in: ids }, bannedAt: null },
        { projection: { osuId: 1, username: 1, discordId: 1 } },
      );
    for await (const user of users) {
      if (user.discordId && typeof user.osuId === "number" && user.username) {
        found.set(user.discordId, { osuId: user.osuId, username: user.username });
      }
    }
    return found;
  };

/**
 * @function createLinking
 * @param lookup {LinkLookup} one id
 * @param batch {(ids: readonly string[]) => Promise<Map<string, LinkedAccount>>} many ids
 * @param now {() => number} clock (tests)
 * @returns {Linking} the cached reader
 */
export const createLinking = (
  lookup: LinkLookup,
  batch: (ids: readonly string[]) => Promise<Map<string, LinkedAccount>>,
  now: () => number = Date.now,
): Linking => {
  const cache = createTtlCache<string, LinkedAccount | null>(LINK_TTL_MS, 20_000, now);
  return {
    async get(discordId) {
      const hit = cache.get(discordId);
      if (hit !== undefined) return hit;
      const account = await lookup(discordId);
      cache.set(discordId, account);
      return account;
    },
    async getMany(discordIds) {
      const result = new Map<string, LinkedAccount>();
      const missing: string[] = [];
      for (const id of new Set(discordIds)) {
        const hit = cache.get(id);
        if (hit === undefined) missing.push(id);
        else if (hit) result.set(id, hit);
      }
      if (missing.length > 0) {
        const found = await batch(missing);
        for (const id of missing) {
          const account = found.get(id) ?? null;
          cache.set(id, account);
          if (account) result.set(id, account);
        }
      }
      return result;
    },
  };
};
