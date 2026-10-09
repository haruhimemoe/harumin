/**
 * @file src/views/practice.ts
 * @desc /practice's picker. Mods sort into buckets (NM, HD, HR, DT alone or with passive mods;
 *       anything else FM). The target is a bucket (the player's most common one in their top
 *       100 unless given) and stars (the median of that bucket's plays in the top 50, or in the
 *       top 100 when the top 50 has none, plus 0.2). The pick keeps new maps closest to the
 *       target: closer stars, then higher similarity, then lower id.
 * @author David @dvhsh (https://dvh.sh)
 * @created Thu Oct 8, 2026
 * @modified Thu Oct 8, 2026
 */

/** The mod buckets. /practice offers all but FM (pools has no FM lens). */
export const BUCKETS = ["NM", "HD", "HR", "DT", "FM"] as const;

/** One mod bucket. */
export type Bucket = (typeof BUCKETS)[number];

/** A top play as the picker reads it (stars already mod-adjusted for HR and DT). */
export type TopPlay = { beatmapId: number; mods: string[]; stars: number };

/** A map pools offered. */
export type Candidate = {
  beatmapId: number;
  title: string;
  stars: number;
  lengthSeconds: number;
  similarity: number;
};

/** What /practice aims at. */
export type PracticeTarget = { bucket: Bucket; stars: number };

/** Mods that don't change the bucket. */
const PASSIVE = new Set(["NF", "SD", "PF", "CL"]);

/**
 * @function bucketOf
 * @param mods {readonly string[]} a score's mod acronyms
 * @returns {Bucket} NM, HD, HR, DT (DT or NC) alone or with passive mods, else FM
 */
export const bucketOf = (mods: readonly string[]): Bucket => {
  const active = mods.filter((mod) => !PASSIVE.has(mod));
  if (active.length === 0) return "NM";
  if (active.length > 1) return "FM";
  const [mod] = active;
  if (mod === "HD" || mod === "HR") return mod;
  if (mod === "DT" || mod === "NC") return "DT";
  return "FM";
};

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
};

/**
 * @function practiceTarget
 * @param top {readonly TopPlay[]} the player's top plays, best first
 * @param bucket {Bucket} the bucket asked for (default the most common in the top 100)
 * @returns {PracticeTarget | null} the bucket and stars, or null when the bucket has no plays
 */
export const practiceTarget = (top: readonly TopPlay[], bucket?: Bucket): PracticeTarget | null => {
  const hundred = top.slice(0, 100);
  let chosen = bucket;
  if (!chosen) {
    const counts = new Map<Bucket, number>();
    for (const play of hundred) {
      const b = bucketOf(play.mods);
      counts.set(b, (counts.get(b) ?? 0) + 1);
    }
    let best = 0;
    for (const b of BUCKETS) {
      const count = counts.get(b) ?? 0;
      if (count > best) {
        best = count;
        chosen = b;
      }
    }
  }
  if (!chosen) return null;
  const inBucket = hundred.filter((play) => bucketOf(play.mods) === chosen);
  if (inBucket.length === 0) return null;
  const fifty = hundred.slice(0, 50).filter((play) => bucketOf(play.mods) === chosen);
  const stars = median((fifty.length ? fifty : inBucket).map((play) => play.stars)) + 0.2;
  return { bucket: chosen, stars: Math.round(stars * 100) / 100 };
};

/**
 * @function pickPractice
 * @param target {PracticeTarget} what to aim at
 * @param candidates {readonly Candidate[]} every map pools offered, any order, maybe repeated
 * @param exclude {ReadonlySet<number>} maps already in the player's top 100
 * @param count {number} how many to keep
 * @returns {Candidate[]} the closest new maps, each once
 */
export const pickPractice = (
  target: PracticeTarget,
  candidates: readonly Candidate[],
  exclude: ReadonlySet<number>,
  count: number,
): Candidate[] => {
  const seen = new Set<number>();
  const fresh = candidates.filter((map) => {
    if (exclude.has(map.beatmapId) || seen.has(map.beatmapId)) return false;
    seen.add(map.beatmapId);
    return true;
  });
  const distance = (map: Candidate) => Math.abs(map.stars - target.stars);
  return fresh
    .sort(
      (a, b) =>
        distance(a) - distance(b) || b.similarity - a.similarity || a.beatmapId - b.beatmapId,
    )
    .slice(0, count);
};
