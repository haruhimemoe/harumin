/**
 * @file src/views/replay.ts
 * @desc An .osr as a score: its header read, the map found by its MD5, the player looked up by
 *       name, rosu's pp, all drawn as /recent's score card ("Replay" above the map). /render and
 *       the .osr listener both use it. A map osu! doesn't know (unsubmitted, or edited since)
 *       can't be shown or rendered.
 * @author David @dvhsh (https://dvh.sh)
 * @created Sat Oct 10, 2026
 * @modified Sat Oct 10, 2026
 */

import type { BeatmapDetail, OsuScore, OsuUserProfile } from "@haruhimemoe/osu";
import { parseReplayHeader, type ReplayHeader, replayScore } from "@haruhimemoe/osu/replay";
import type { ScorePp } from "../services/pp.ts";
import type { Services } from "../types.ts";
import { toScoreCard } from "./cards.ts";
import { tryScorePp } from "./pp.ts";

/** Biggest .osr taken. Replays of long maps run a few MB. */
export const MAX_REPLAY_BYTES = 10 * 1024 * 1024;

/** A replay with everything a card needs. */
export type LoadedReplay = {
  header: ReplayHeader;
  map: BeatmapDetail;
  score: OsuScore;
  /** The player, or null when osu! has nobody by the replay's name now (renamed, restricted). */
  profile: OsuUserProfile | null;
  pp: ScorePp | null;
};

/**
 * @function toReplayScore
 * @param header {ReplayHeader} the replay
 * @param map {BeatmapDetail} its difficulty
 * @param osuId {number} the player's id, or 0 when unknown
 * @returns {OsuScore} the replay as an API score (pp left for rosu)
 */
export const toReplayScore = (
  header: ReplayHeader,
  map: BeatmapDetail,
  osuId: number,
): OsuScore => {
  const { statistics, accuracy, rank } = replayScore(header);
  return {
    id: header.scoreId ?? 0,
    userId: osuId,
    beatmapId: map.beatmapId,
    ruleset: header.ruleset,
    mods: header.mods.map((acronym) => ({ acronym })),
    accuracy,
    maxCombo: header.maxCombo,
    statistics,
    maximumStatistics: null,
    rank,
    pp: null,
    totalScore: header.totalScore,
    legacyTotalScore: header.totalScore,
    passed: true,
    perfectCombo: header.perfect,
    endedAt: header.playedAt,
    weightedPp: null,
    beatmap: {
      beatmapId: map.beatmapId,
      beatmapsetId: map.beatmapsetId,
      version: map.version,
      starRating: map.starRating,
      mode: map.mode,
      checksum: map.checksum,
      maxCombo: map.maxCombo,
    },
    beatmapset: {
      beatmapsetId: map.beatmapsetId,
      title: map.title,
      artist: map.artist,
      titleUnicode: null,
      artistUnicode: null,
      creator: map.creator,
    },
    user: null,
  };
};

/** Why a replay can't be shown. */
export type ReplayProblem = "unreadable" | "unknown_map";

/** What to tell someone for each problem. */
export const REPLAY_PROBLEMS: Readonly<Record<ReplayProblem, string>> = Object.freeze({
  unreadable: "That file isn't an osu! replay I can read.",
  unknown_map:
    "osu! doesn't know the map this replay was played on (unsubmitted, or changed since), so it can't be shown or rendered.",
});

/**
 * @function loadReplay
 * @param s {Pick<Services, "osu" | "beatmaps">} osu! and the .osu cache
 * @param bytes {Uint8Array} an .osr
 * @returns {Promise<{ ok: true; replay: LoadedReplay } | { ok: false; problem: ReplayProblem }>}
 * @throws {OsuApiError} when osu! fails the map lookup (not a 404)
 */
export const loadReplay = async (
  s: Pick<Services, "osu" | "beatmaps">,
  bytes: Uint8Array,
): Promise<{ ok: true; replay: LoadedReplay } | { ok: false; problem: ReplayProblem }> => {
  let header: ReplayHeader;
  try {
    header = parseReplayHeader(bytes);
  } catch {
    return { ok: false, problem: "unreadable" };
  }
  const map = await s.osu.getBeatmapByChecksum(header.beatmapMd5);
  if (!map) return { ok: false, problem: "unknown_map" };
  const profile = header.username
    ? await s.osu.getUserProfile(header.username, { ruleset: header.ruleset }).catch(() => null)
    : null;
  const score = toReplayScore(header, map, profile?.osuId ?? 0);
  const pp = await tryScorePp(s, score);
  return { ok: true, replay: { header, map, score, profile, pp } };
};

/**
 * @function replayLine
 * @param replay {LoadedReplay} a loaded replay
 * @returns {string} one line for when there's no card: map, mods, accuracy, combo, rank, player
 */
export const replayLine = ({ header, map, score, pp }: LoadedReplay): string => {
  const mods = header.mods.length ? ` +${header.mods.join("")}` : "";
  const shownPp = pp ? ` · ${Math.round(pp.pp)}pp` : "";
  return `**${map.artist} - ${map.title} [${map.version}]**${mods} · ${(score.accuracy * 100).toFixed(2)}% · ${header.maxCombo}x · ${score.rank}${shownPp} · ${header.username || "unknown player"}`;
};

/**
 * @function replayCard
 * @param s {Pick<Services, "cards">} the card renderer
 * @param replay {LoadedReplay} a loaded replay
 * @returns {Promise<Buffer | null>} the score card, or null when there's no player to put on it
 *          or the site didn't draw it
 */
export const replayCard = async (
  s: Pick<Services, "cards">,
  replay: LoadedReplay,
): Promise<Buffer | null> => {
  if (!replay.profile) return null;
  return s.cards.draw(
    "score",
    toScoreCard(replay.score, {
      profile: replay.profile,
      ruleset: replay.header.ruleset,
      pp: replay.pp,
      heading: "Replay",
      tries: 1,
    }),
  );
};
