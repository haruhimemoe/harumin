/**
 * @file tests/helpers.ts
 * @desc Hand-made osu! data for tests (osu!'s shapes, made-up values) and a fake clock.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import type { BeatmapDetail, OsuScore, OsuUserProfile } from "@haruhimemoe/osu";

export const FIXTURE_OSU = new Uint8Array(
  readFileSync(path.join(import.meta.dirname, "fixtures/fixture.osu")),
);

export const clock = (start = 1_000_000) => {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
};

export const makeScore = (over: Partial<OsuScore> = {}): OsuScore => ({
  id: 1,
  userId: 2,
  beatmapId: 75,
  ruleset: "osu",
  mods: [],
  accuracy: 0.98,
  maxCombo: 120,
  statistics: { great: 110, ok: 5, meh: 0, miss: 1 },
  maximumStatistics: { great: 116 },
  rank: "A",
  pp: 100,
  totalScore: 900_000,
  legacyTotalScore: null,
  passed: true,
  perfectCombo: false,
  endedAt: "2026-10-06T12:00:00Z",
  weightedPp: null,
  beatmap: {
    beatmapId: 75,
    beatmapsetId: 1,
    version: "Normal",
    starRating: 5.5,
    mode: "osu",
    checksum: null,
    maxCombo: 132,
  },
  beatmapset: { beatmapsetId: 1, title: "DISCOPRINCE", artist: "Kenji Ninuma", creator: "peppy" },
  user: { osuId: 2, username: "peppy", avatarUrl: null, countryCode: "AU" },
  ...over,
});

export const makeProfile = (over: Partial<OsuUserProfile> = {}): OsuUserProfile => ({
  osuId: 2,
  username: "peppy",
  avatarUrl: "https://a.ppy.sh/2",
  countryCode: "AU",
  playmode: "osu",
  joinDate: "2007-08-28T03:09:12+00:00",
  supporter: true,
  coverUrl: null,
  statistics: {
    pp: 1234.5,
    globalRank: 100,
    countryRank: 5,
    accuracy: 97.5,
    playCount: 50,
    playTime: 3600,
    rankedScore: 10,
    totalHits: 20,
    maxCombo: 30,
    level: 100.42,
    grades: { ssh: 1, ss: 2, sh: 3, s: 4, a: 5 },
  },
  ...over,
});

export const makeMap = (over: Partial<BeatmapDetail> = {}): BeatmapDetail => ({
  beatmapId: 75,
  beatmapsetId: 1,
  mode: "osu",
  title: "DISCOPRINCE",
  artist: "Kenji Ninuma",
  version: "Normal",
  creator: "peppy",
  creatorId: 2,
  cs: 4,
  ar: 6,
  od: 6,
  hp: 6,
  bpm: 120,
  lengthSeconds: 142,
  starRating: 2.55,
  checksum: null,
  maxCombo: 314,
  status: "ranked",
  ...over,
});
