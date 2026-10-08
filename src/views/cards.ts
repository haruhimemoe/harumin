/**
 * @file src/views/cards.ts
 * @desc osu! data as the card images want it (harumin-config's card shapes): the player, a
 *       profile, and a score with the same pp rules as the text embeds (osu!'s pp, else rosu's
 *       marked approximate, and the full-combo pp when it wasn't one). Titles and artists in
 *       their own script when osu! has them (the site draws Japanese). Covers that aren't on
 *       assets.ppy.sh are dropped and odd mod acronyms skipped, so a card always parses.
 * @author David @dvhsh (https://dvh.sh)
 * @created Wed Oct 7, 2026
 * @modified Wed Oct 7, 2026
 */

import type {
  CardPlayer,
  CardScore,
  CompareCard,
  LeaderboardCard,
  MapCard,
  ProfileCard,
  Ruleset,
  ScoreCard,
  ScoreListCard,
  SimulateCard,
} from "@haruhimemoe/harumin-config";
import type { BeatmapDetail, OsuMod, OsuScore, OsuUserProfile } from "@haruhimemoe/osu";
import type { AccuracyPp, MapAttributes, ScorePp } from "../services/pp.ts";
import { completion } from "../utils/format.ts";

/** Each ruleset's judgements, in order, with the label a card prints. */
const HIT_LABELS: Readonly<Record<Ruleset, readonly (readonly [string, string])[]>> = {
  osu: [
    ["great", "300"],
    ["ok", "100"],
    ["meh", "50"],
    ["miss", "miss"],
  ],
  taiko: [
    ["great", "great"],
    ["ok", "good"],
    ["miss", "miss"],
  ],
  fruits: [
    ["great", "fruits"],
    ["large_tick_hit", "drops"],
    ["small_tick_hit", "droplets"],
    ["miss", "miss"],
  ],
  mania: [
    ["perfect", "MAX"],
    ["great", "300"],
    ["good", "200"],
    ["ok", "100"],
    ["meh", "50"],
    ["miss", "miss"],
  ],
};

const percentOf = (value: number): number => Math.min(100, Math.max(0, value));

/** Mod acronyms a card accepts (odd ones are skipped). */
const cardMods = (mods: readonly Pick<OsuMod, "acronym">[]): string[] =>
  mods.map((mod) => mod.acronym).filter((acronym) => /^[A-Z0-9]{2,3}$/.test(acronym));

const countryOrNull = (code: string | null | undefined): string | null => {
  const upper = code?.toUpperCase() ?? null;
  return upper && /^[A-Z]{2}$/.test(upper) ? upper : null;
};

/**
 * @function toCardMap
 * @param map {BeatmapDetail} the difficulty
 * @param stars {number | null} the rating to show (with mods), or null for osu!'s own
 * @returns {CardScore["map"]} the map strip's data
 */
export const toCardMap = (map: BeatmapDetail, stars: number | null): CardScore["map"] => ({
  beatmapId: map.beatmapId,
  beatmapsetId: map.beatmapsetId,
  artist: map.artist.slice(0, 256),
  title: map.title.slice(0, 256),
  version: map.version.slice(0, 256),
  stars: stars ?? map.starRating,
});

const isoOrNull = (value: string | null): string | null => {
  if (!value) return null;
  const time = new Date(value);
  return Number.isNaN(time.getTime()) ? null : time.toISOString();
};

/**
 * @function toCardPlayer
 * @param profile {OsuUserProfile} the player
 * @returns {CardPlayer} who a card is about
 */
export const toCardPlayer = (profile: OsuUserProfile): CardPlayer => {
  return {
    osuId: profile.osuId,
    username: profile.username,
    countryCode: countryOrNull(profile.countryCode),
    coverUrl: profile.coverUrl?.startsWith("https://assets.ppy.sh/") ? profile.coverUrl : null,
    supporter: profile.supporter,
    pp: Math.max(0, profile.statistics.pp),
    globalRank: profile.statistics.globalRank || null,
    countryRank: profile.statistics.countryRank || null,
  };
};

/**
 * @function toProfileCard
 * @param profile {OsuUserProfile} the player
 * @param ruleset {Ruleset} which ruleset's numbers these are
 * @returns {ProfileCard} /osu's card
 */
export const toProfileCard = (profile: OsuUserProfile, ruleset: Ruleset): ProfileCard => {
  const s = profile.statistics;
  return {
    ruleset,
    player: toCardPlayer(profile),
    accuracy: Math.min(100, Math.max(0, s.accuracy)),
    level: Math.max(0, s.level),
    playCount: s.playCount,
    playTime: s.playTime,
    maxCombo: s.maxCombo,
    rankedScore: s.rankedScore,
    grades: s.grades,
    joinDate: isoOrNull(profile.joinDate),
    cover: "image",
  };
};

/**
 * @function toCardScore
 * @param score {OsuScore} the score, with its beatmap and set
 * @param pp {ScorePp | null} rosu's numbers, or null when the .osu file wasn't available
 * @returns {CardScore} the score as a card draws it
 */
export const toCardScore = (score: OsuScore, pp: ScorePp | null): CardScore => {
  const mapMaxCombo = pp?.maxCombo ?? score.beatmap?.maxCombo ?? null;
  const shownPp = score.pp ?? (score.passed ? (pp?.pp ?? null) : null);
  const isFc =
    score.perfectCombo ||
    (mapMaxCombo !== null && score.maxCombo >= mapMaxCombo && (score.statistics.miss ?? 0) === 0);
  const showFc = pp !== null && !isFc && score.passed;
  return {
    map: {
      beatmapId: score.beatmapId,
      beatmapsetId: score.beatmap?.beatmapsetId ?? score.beatmapset?.beatmapsetId ?? null,
      artist: score.beatmapset?.artistUnicode || score.beatmapset?.artist || "",
      title:
        score.beatmapset?.titleUnicode || score.beatmapset?.title || `Beatmap #${score.beatmapId}`,
      version: score.beatmap?.version ?? "",
      stars: pp?.stars ?? score.beatmap?.starRating ?? null,
    },
    grade: score.passed ? score.rank : "F",
    mods: cardMods(score.mods),
    pp: shownPp,
    ppApprox: score.pp === null && shownPp !== null,
    fcPp: showFc ? pp.fcPp : null,
    fcAccuracy: showFc ? pp.fcAccuracy : null,
    accuracy: Math.min(100, Math.max(0, score.accuracy * 100)),
    totalScore: score.totalScore,
    combo: score.maxCombo,
    mapMaxCombo,
    hits: HIT_LABELS[score.ruleset].map(([key, label]) => ({
      label,
      count: score.statistics[key] ?? 0,
    })),
    passed: score.passed,
    completion: score.passed ? null : completion(score),
    endedAt: new Date(score.endedAt).toISOString(),
  };
};

/**
 * @function toScoreCard
 * @param score {OsuScore} the score
 * @param options {{ profile; ruleset; pp; heading; tries }} who, which ruleset, rosu's numbers,
 *        the line above the map, and which try in a row (shown from 2)
 * @returns {ScoreCard} /recent's card
 */
export const toScoreCard = (
  score: OsuScore,
  options: {
    profile: OsuUserProfile;
    ruleset: Ruleset;
    pp: ScorePp | null;
    heading: string;
    tries: number;
  },
): ScoreCard => ({
  ruleset: options.ruleset,
  player: toCardPlayer(options.profile),
  heading: options.heading,
  score: toCardScore(score, options.pp),
  tries: options.tries > 1 ? options.tries : null,
});

/**
 * @function toScoreListCard
 * @param entries {readonly { score: OsuScore; place: number; pp?: ScorePp | null }[]} one page,
 *        with rosu's numbers where they were worked out (the row then shows the full-combo pp)
 * @param options {{ profile; ruleset; title; note; page; pages }} the list around them
 * @returns {ScoreListCard} /top's card
 */
export const toScoreListCard = (
  entries: readonly { score: OsuScore; place: number; pp?: ScorePp | null }[],
  options: {
    profile: OsuUserProfile;
    ruleset: Ruleset;
    title: string;
    note: string | null;
    page: number;
    pages: number;
  },
): ScoreListCard => ({
  ruleset: options.ruleset,
  player: toCardPlayer(options.profile),
  title: options.title,
  note: options.note,
  page: options.page,
  pages: Math.max(1, options.pages),
  rows: entries.map(({ score, place, pp }) => ({ place, score: toCardScore(score, pp ?? null) })),
});

/**
 * @function toMapCard
 * @param map {BeatmapDetail} the difficulty
 * @param options {{ mods; stars; attrs; pps }} the mods, the rating with them, rosu's numbers
 *        with them (null without the .osu file) and pp at each accuracy
 * @returns {MapCard} /map's card; AR only where the ruleset has it, OD everywhere but catch
 */
export const toMapCard = (
  map: BeatmapDetail,
  options: {
    mods: readonly OsuMod[];
    stars: number | null;
    attrs: MapAttributes | null;
    pps: readonly AccuracyPp[] | null;
  },
): MapCard => {
  const { attrs } = options;
  const rate = attrs?.clockRate ?? 1;
  const ar = attrs ? attrs.ar : map.ar;
  const od = attrs ? attrs.od : map.od;
  return {
    ruleset: map.mode,
    map: {
      ...toCardMap(map, options.stars ?? attrs?.stars ?? null),
      creator: map.creator.slice(0, 32),
      status: map.status?.slice(0, 16) ?? null,
    },
    mods: cardMods(options.mods),
    cs: Math.max(0, attrs?.cs ?? map.cs),
    ar: map.mode === "osu" || map.mode === "fruits" ? Math.max(0, ar ?? 0) : null,
    od: map.mode === "fruits" ? null : Math.max(0, od ?? 0),
    hp: Math.max(0, attrs?.hp ?? map.hp),
    lengthSeconds: Math.max(0, map.lengthSeconds / rate),
    bpm: Math.max(0, map.bpm * rate),
    maxCombo: attrs?.maxCombo ?? map.maxCombo,
    pps: (options.pps ?? []).slice(0, 6).map(({ accuracy, pp }) => ({
      accuracy: percentOf(accuracy),
      pp: Math.max(0, pp),
    })),
  };
};

/**
 * @function toLeaderboardCard
 * @param map {BeatmapDetail} the difficulty
 * @param scores {readonly OsuScore[]} one page
 * @param options {{ start; page; pages; filter }} the first row's index, the page, and the mod
 *        filter's text
 * @returns {LeaderboardCard} /leaderboard's card
 */
export const toLeaderboardCard = (
  map: BeatmapDetail,
  scores: readonly OsuScore[],
  options: { start: number; page: number; pages: number; filter: string | null },
): LeaderboardCard => ({
  map: toCardMap(map, null),
  filter: options.filter,
  page: options.page,
  pages: Math.max(1, options.pages),
  rows: scores.map((score, i) => ({
    place: options.start + i + 1,
    osuId: score.user?.osuId ?? null,
    username: score.user?.username.slice(0, 32) || "?",
    countryCode: countryOrNull(score.user?.countryCode),
    grade: score.passed ? score.rank : "F",
    mods: cardMods(score.mods),
    pp: score.pp,
    accuracy: percentOf(score.accuracy * 100),
    combo: score.maxCombo,
    totalScore: score.totalScore,
  })),
});

/**
 * @function toSimulateCard
 * @param map {BeatmapDetail} the difficulty
 * @param result {{ pp: number; stars: number; maxCombo: number }} rosu's answer
 * @param input {{ mods; accuracy?; combo?; misses? }} what was asked (missing means perfect)
 * @returns {SimulateCard} /simulate's card
 */
export const toSimulateCard = (
  map: BeatmapDetail,
  result: { pp: number; stars: number; maxCombo: number },
  input: {
    mods: readonly OsuMod[];
    accuracy?: number | undefined;
    combo?: number | undefined;
    misses?: number | undefined;
  },
): SimulateCard => ({
  ruleset: map.mode,
  map: toCardMap(map, result.stars),
  mods: cardMods(input.mods),
  accuracy: percentOf(input.accuracy ?? 100),
  combo: Math.min(input.combo ?? result.maxCombo, result.maxCombo),
  mapMaxCombo: result.maxCombo,
  misses: input.misses ?? 0,
  pp: Math.max(0, result.pp),
});

/**
 * @function toCompareCard
 * @param a {{ profile: OsuUserProfile; top: readonly OsuScore[] }} the first player and their best play
 * @param b {{ profile: OsuUserProfile; top: readonly OsuScore[] }} the second
 * @param ruleset {Ruleset} the ruleset compared
 * @returns {CompareCard} /compare's card
 */
export const toCompareCard = (
  a: { profile: OsuUserProfile; top: readonly OsuScore[] },
  b: { profile: OsuUserProfile; top: readonly OsuScore[] },
  ruleset: Ruleset,
): CompareCard => {
  const side = ({ profile, top }: { profile: OsuUserProfile; top: readonly OsuScore[] }) => ({
    player: toCardPlayer(profile),
    accuracy: percentOf(profile.statistics.accuracy),
    playCount: profile.statistics.playCount,
    playTime: profile.statistics.playTime,
    maxCombo: profile.statistics.maxCombo,
    ssCount: profile.statistics.grades.ss + profile.statistics.grades.ssh,
    topPp: top[0]?.pp ?? null,
  });
  return { ruleset, a: side(a), b: side(b) };
};
