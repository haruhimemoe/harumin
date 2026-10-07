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
  ProfileCard,
  Ruleset,
  ScoreCard,
  ScoreListCard,
} from "@haruhimemoe/harumin-config";
import type { OsuScore, OsuUserProfile } from "@haruhimemoe/osu";
import type { ScorePp } from "../services/pp.ts";
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
  const code = profile.countryCode?.toUpperCase() ?? null;
  return {
    osuId: profile.osuId,
    username: profile.username,
    countryCode: code && /^[A-Z]{2}$/.test(code) ? code : null,
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
    mods: score.mods.map((mod) => mod.acronym).filter((acronym) => /^[A-Z0-9]{2,3}$/.test(acronym)),
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
 * @param entries {readonly { score: OsuScore; place: number }[]} one page
 * @param options {{ profile; ruleset; title; note; page; pages }} the list around them
 * @returns {ScoreListCard} /top's card
 */
export const toScoreListCard = (
  entries: readonly { score: OsuScore; place: number }[],
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
  rows: entries.map(({ score, place }) => ({ place, score: toCardScore(score, null) })),
});
