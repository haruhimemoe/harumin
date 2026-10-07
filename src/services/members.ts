/**
 * @file src/services/members.ts
 * @desc Who harumin has seen in each guild, without the privileged members intent: anyone who
 *       sends a message or runs a command is recorded (once a day per guild and person, written
 *       in batches). /server ranks the linked ones; the dashboard checks the guilds a person was
 *       seen in for Manage Server.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { HARUMIN_COLLECTIONS } from "@haruhimemoe/harumin-config";
import type { Db } from "mongodb";

/** The store. */
export type Members = {
  /** Notes a sighting; cheap, call on every message. */
  seen: (guildId: string, discordId: string) => void;
  /** Writes pending sightings. */
  flush: () => Promise<void>;
  /** Everyone seen in a guild in the last `days`. */
  inGuild: (guildId: string, days?: number) => Promise<string[]>;
  /** The guilds someone was seen in. */
  guildsOf: (discordId: string) => Promise<string[]>;
};

type MemberDoc = { guildId: string; discordId: string; seenAt: Date };

const DAY_MS = 86_400_000;

/**
 * @function createMembers
 * @param db {Db} harumin's database
 * @param now {() => number} clock (tests)
 * @returns {Members} the store
 */
export const createMembers = (db: Db, now: () => number = Date.now): Members => {
  const collection = db.collection<MemberDoc>(HARUMIN_COLLECTIONS.members);
  const recent = new Map<string, number>();
  let pending = new Map<string, MemberDoc>();

  return {
    seen(guildId, discordId) {
      const key = `${guildId}:${discordId}`;
      const at = now();
      const last = recent.get(key);
      if (last !== undefined && at - last < DAY_MS) return;
      recent.set(key, at);
      pending.set(key, { guildId, discordId, seenAt: new Date(at) });
      if (recent.size > 200_000) recent.clear();
    },
    async flush() {
      if (pending.size === 0) return;
      const batch = [...pending.values()];
      pending = new Map();
      await collection.bulkWrite(
        batch.map((doc) => ({
          updateOne: {
            filter: { guildId: doc.guildId, discordId: doc.discordId },
            update: { $set: { seenAt: doc.seenAt } },
            upsert: true,
          },
        })),
        { ordered: false },
      );
    },
    async inGuild(guildId, days = 90) {
      const since = new Date(now() - days * DAY_MS);
      const docs = await collection
        .find({ guildId, seenAt: { $gte: since } }, { projection: { discordId: 1 } })
        .limit(5_000)
        .toArray();
      return docs.map((doc) => doc.discordId);
    },
    async guildsOf(discordId) {
      const docs = await collection
        .find({ discordId }, { projection: { guildId: 1 } })
        .limit(500)
        .toArray();
      return docs.map((doc) => doc.guildId);
    },
  };
};

/** The indexes the store needs. */
export const MEMBER_INDEXES = [
  { key: { guildId: 1, discordId: 1 }, unique: true },
  { key: { discordId: 1 } },
  { key: { seenAt: 1 }, expireAfterSeconds: 180 * 86_400 },
] as const;
