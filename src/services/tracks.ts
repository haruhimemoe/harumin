/**
 * @file src/services/tracks.ts
 * @desc /track: post a player's new top plays to a channel. Entries live in harumin's database.
 *       One poller checks each tracked (player, ruleset) once per round, however many guilds
 *       track them: their top 100 from osu!, compared by score id with what it saw last time.
 *       The first look only records; later looks post the new ones to every channel tracking
 *       that player. A round's length grows with the number of players so the poller never takes
 *       more than half the osu! budget.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import {
  HARUMIN_COLLECTIONS,
  MAX_TRACKED_PER_GUILD,
  type Ruleset,
  type TrackEntry,
} from "@haruhimemoe/harumin-config";
import type { OsuScore } from "@haruhimemoe/osu";
import type { Db } from "mongodb";
import type { Osu } from "./osu.ts";

/** What add answers. */
export type AddResult = "added" | "exists" | "full";

/** The store and poller. */
export type Tracks = {
  add: (entry: TrackEntry) => Promise<AddResult>;
  remove: (guildId: string, osuId: number, ruleset: Ruleset) => Promise<boolean>;
  list: (guildId: string) => Promise<TrackEntry[]>;
  /** Starts polling; `post` sends one new top play to one channel. */
  start: (post: (channelId: string, score: OsuScore, place: number) => Promise<void>) => void;
  stop: () => void;
  /** One full round now (tests, and the first round). */
  round: () => Promise<number>;
};

type StateDoc = { osuId: number; mode: Ruleset; scoreIds: number[]; checkedAt: Date };

/**
 * @function newTopPlays
 * @param seen {readonly number[] | null} score ids from the last look (null: never looked)
 * @param scores {readonly OsuScore[]} the top plays now, best first
 * @returns {{ score: OsuScore; place: number }[]} the plays that weren't there, with their place
 *          (1-based); none on a first look
 */
export const newTopPlays = (
  seen: readonly number[] | null,
  scores: readonly OsuScore[],
): { score: OsuScore; place: number }[] => {
  if (seen === null) return [];
  const known = new Set(seen);
  return scores
    .map((score, i) => ({ score, place: i + 1 }))
    .filter(({ score }) => !known.has(score.id));
};

/**
 * @function roundIntervalMs
 * @param players {number} distinct (player, ruleset) pairs tracked
 * @param perMinute {number} the whole osu! budget per minute
 * @returns {number} how long one round should take: at least 2 minutes, and long enough that the
 *          poller uses half the budget at most
 */
export const roundIntervalMs = (players: number, perMinute: number): number =>
  Math.max(120_000, Math.ceil((players / (perMinute / 2)) * 60_000));

/**
 * @function createTracks
 * @param db {Db} harumin's database
 * @param osu {Osu} the budgeted osu! client
 * @param options {{ perMinute: number; log?: (message: string, error?: unknown) => void }}
 * @returns {Tracks} the store and poller
 */
export const createTracks = (
  db: Db,
  osu: Pick<Osu, "getUserScores">,
  {
    perMinute,
    log = () => undefined,
  }: { perMinute: number; log?: (message: string, error?: unknown) => void },
): Tracks => {
  const tracks = db.collection<TrackEntry>(HARUMIN_COLLECTIONS.tracks);
  const state = db.collection<StateDoc>(HARUMIN_COLLECTIONS.trackState);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let poster: ((channelId: string, score: OsuScore, place: number) => Promise<void>) | null = null;

  const pairs = async () =>
    tracks
      .aggregate<{ _id: { osuId: number; mode: Ruleset }; channels: string[] }>([
        {
          $group: {
            _id: { osuId: "$osuId", mode: "$mode" },
            channels: { $addToSet: "$channelId" },
          },
        },
      ])
      .toArray();

  const round = async (): Promise<number> => {
    let posted = 0;
    for (const { _id, channels } of await pairs()) {
      try {
        const scores = await osu.getUserScores(_id.osuId, "best", {
          ruleset: _id.mode,
          limit: 100,
        });
        const previous = await state.findOne({ osuId: _id.osuId, mode: _id.mode });
        const fresh = newTopPlays(previous?.scoreIds ?? null, scores);
        await state.updateOne(
          { osuId: _id.osuId, mode: _id.mode },
          { $set: { scoreIds: scores.map((score) => score.id), checkedAt: new Date() } },
          { upsert: true },
        );
        for (const { score, place } of fresh.slice(0, 5)) {
          for (const channelId of channels) {
            await poster?.(channelId, score, place).catch((error) =>
              log("track post failed", error),
            );
            posted += 1;
          }
        }
      } catch (error) {
        log(`track check failed for ${_id.osuId}/${_id.mode}`, error);
      }
    }
    return posted;
  };

  const schedule = async () => {
    const count = (await pairs()).length;
    timer = setTimeout(
      async () => {
        await round().catch((error) => log("track round failed", error));
        if (timer) await schedule();
      },
      roundIntervalMs(count, perMinute),
    );
  };

  return {
    async add(entry) {
      const existing = await tracks.findOne({
        guildId: entry.guildId,
        osuId: entry.osuId,
        mode: entry.mode,
      });
      if (existing) {
        if (existing.channelId === entry.channelId) return "exists";
        await tracks.updateOne({ _id: existing._id }, { $set: { channelId: entry.channelId } });
        return "added";
      }
      if ((await tracks.countDocuments({ guildId: entry.guildId })) >= MAX_TRACKED_PER_GUILD)
        return "full";
      await tracks.insertOne({ ...entry });
      return "added";
    },
    async remove(guildId, osuId, ruleset) {
      const result = await tracks.deleteOne({ guildId, osuId, mode: ruleset });
      return result.deletedCount > 0;
    },
    list: (guildId) =>
      tracks
        .find({ guildId }, { projection: { _id: 0 } })
        .sort({ addedAt: 1 })
        .toArray() as Promise<TrackEntry[]>,
    start(post) {
      poster = post;
      timer = setTimeout(() => undefined, 0);
      void schedule();
    },
    stop() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
    round,
  };
};

/** The indexes the store needs. */
export const TRACK_INDEXES = [
  { key: { guildId: 1, osuId: 1, mode: 1 }, unique: true },
  { key: { osuId: 1, mode: 1 } },
] as const;
