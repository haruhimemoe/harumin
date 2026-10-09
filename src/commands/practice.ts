/**
 * @file src/commands/practice.ts
 * @desc /practice: maps like the player's top plays, a bit harder. Reads the osu!standard top
 *       100 (kept 30 minutes), picks a bucket (NM, HD, HR, DT) and a star target, asks pools'
 *       similar-maps route for up to 5 seeds, and keeps the closest new maps. HR and DT stars
 *       come from osu!'s attributes (cached a day), for the 10 best plays of the bucket in the
 *       top 50 at most. A finished pick is kept an hour, so a repeat costs no osu! or pools call.
 *       The answer is a pool card with an "Open as a pack" link (a /k# key: nothing is hosted).
 * @author David @dvhsh (https://dvh.sh)
 * @created Thu Oct 8, 2026
 * @modified Thu Oct 8, 2026
 */

import type { OsuScore } from "@haruhimemoe/osu";
import { beatmapUrl } from "@haruhimemoe/osu/shapes";
import { encodePackKey } from "@haruhimemoe/pool";
import { SlashCommandBuilder } from "discord.js";
import { LINKS } from "../constants.ts";
import { card } from "../embeds/common.ts";
import { createTtlCache } from "../services/cache.ts";
import type { Command, Services } from "../types.ts";
import {
  type Bucket,
  bucketOf,
  type Candidate,
  type PracticeTarget,
  pickPractice,
  practiceTarget,
  type TopPlay,
} from "../views/practice.ts";
import { toPracticeCard } from "../views/toolCards.ts";
import { addPlayerOptions, fail, imageOrEmbed, linkButtons, loadPlayer } from "./shared.ts";

/** The buckets /practice offers (pools has no FM lens). */
const PRACTICE_BUCKETS = ["NM", "HD", "HR", "DT"] as const;
type PracticeBucket = (typeof PRACTICE_BUCKETS)[number];

/** The most plays whose HR or DT stars are asked of osu!. */
const RATED_PLAYS = 10;
/** The most seeds sent to pools. */
const SEEDS = 5;
/** The star window around the target pools is asked for. */
const WINDOW = 0.4;

const tops = createTtlCache<number, OsuScore[]>(30 * 60_000, 500);
const rated = createTtlCache<string, number | null>(24 * 60 * 60_000, 5_000);
type PracticePick = { target: PracticeTarget; maps: Candidate[] };
const picks = createTtlCache<string, PracticePick | "none">(60 * 60_000, 1_000);

const isPracticeBucket = (bucket: Bucket): bucket is PracticeBucket =>
  (PRACTICE_BUCKETS as readonly string[]).includes(bucket);

/**
 * @function starsOf
 * @param s {Pick<Services, "osu">} osu!
 * @param score {OsuScore} a top play
 * @returns {Promise<number>} its stars under its bucket's mods (nomod for NM and HD)
 */
const starsOf = async (s: Pick<Services, "osu">, score: OsuScore): Promise<number> => {
  const nomod = score.beatmap?.starRating ?? 0;
  const bucket = bucketOf(score.mods.map((mod) => mod.acronym));
  if (bucket !== "HR" && bucket !== "DT") return nomod;
  const key = `${score.beatmapId}:${bucket}`;
  const hit = rated.get(key);
  if (hit !== undefined) return hit ?? nomod;
  const stars = await s.osu.getStarRating(score.beatmapId, [bucket]).catch(() => null);
  rated.set(key, stars);
  return stars ?? nomod;
};

/**
 * @function topPlays
 * @param s {Pick<Services, "osu">} osu!
 * @param scores {readonly OsuScore[]} the top 100, best first
 * @param bucket {Bucket | undefined} the bucket asked for
 * @returns {Promise<TopPlay[]>} the top 100 as the picker reads it: stars rated for the bucket's
 *          first RATED_PLAYS plays, the rest nomod (they only count toward the bucket)
 */
const topPlays = async (
  s: Pick<Services, "osu">,
  scores: readonly OsuScore[],
  bucket: Bucket | undefined,
): Promise<TopPlay[]> => {
  const plays = scores.map((score) => ({
    beatmapId: score.beatmapId,
    mods: score.mods.map((mod) => mod.acronym),
    stars: score.beatmap?.starRating ?? 0,
  }));
  const chosen = bucket ?? practiceTarget(plays)?.bucket;
  if (!chosen) return plays;
  const fifty = scores
    .slice(0, 50)
    .filter((score) => bucketOf(score.mods.map((m) => m.acronym)) === chosen);
  const sample = (
    fifty.length
      ? fifty
      : scores.filter((score) => bucketOf(score.mods.map((m) => m.acronym)) === chosen)
  ).slice(0, RATED_PLAYS);
  const stars = new Map(
    await Promise.all(sample.map(async (score) => [score, await starsOf(s, score)] as const)),
  );
  const keep = new Set(sample);
  // Plays of the bucket past the sample are left out, so the median reads only rated stars.
  return scores.flatMap((score, i) => {
    const play = plays[i] as TopPlay;
    if (bucketOf(play.mods) !== chosen) return [play];
    return keep.has(score) ? [{ ...play, stars: stars.get(score) ?? play.stars }] : [];
  });
};

/**
 * @function pick
 * @param s {Services} osu! and pools
 * @param scores {readonly OsuScore[]} the top 100
 * @param asked {{ bucket?: PracticeBucket; stars?: number; count: number }} the options
 * @returns {Promise<PracticePick | "none" | "no-plays" | "fm" | "unavailable">} the maps, or why not
 */
const pick = async (
  s: Services,
  scores: readonly OsuScore[],
  asked: { bucket?: PracticeBucket | undefined; stars?: number | undefined; count: number },
): Promise<PracticePick | "none" | "no-plays" | "fm" | "unavailable"> => {
  const plays = await topPlays(s, scores, asked.bucket);
  const found = practiceTarget(plays, asked.bucket);
  if (!found) return "no-plays";
  if (!isPracticeBucket(found.bucket)) return "fm";
  const target = { bucket: found.bucket, stars: asked.stars ?? found.stars };
  const seeds = plays
    .filter((play) => bucketOf(play.mods) === target.bucket)
    .sort((a, b) => Math.abs(a.stars - target.stars) - Math.abs(b.stars - target.stars))
    .slice(0, SEEDS);
  const answers = await Promise.all(
    seeds.map((seed) =>
      s.apps.similar(seed.beatmapId, {
        mods: found.bucket as PracticeBucket,
        min: Math.max(0, target.stars - WINDOW),
        max: target.stars + WINDOW,
      }),
    ),
  );
  if (answers.every((answer) => answer === null)) return "unavailable";
  const maps = pickPractice(
    target,
    answers.flatMap((answer) => answer ?? []),
    new Set(scores.map((score) => score.beatmapId)),
    asked.count,
  );
  return maps.length ? { target, maps } : "none";
};

export const practice: Command = {
  category: "haruhime",
  data: addPlayerOptions(
    new SlashCommandBuilder()
      .setName("practice")
      .setDescription("Maps like your top plays, a bit harder (from pools.haruhime.moe)"),
    false,
  )
    .addStringOption((option) =>
      option
        .setName("mods")
        .setDescription("Mods (default: your most played in your top 100)")
        .addChoices(...PRACTICE_BUCKETS.map((value) => ({ name: value, value }))),
    )
    .addNumberOption((option) =>
      option
        .setName("stars")
        .setDescription("Star target (default: a bit over your usual)")
        .setMinValue(1)
        .setMaxValue(12),
    )
    .addIntegerOption((option) =>
      option
        .setName("count")
        .setDescription("How many maps (default 10)")
        .setMinValue(5)
        .setMaxValue(20),
    )
    .toJSON(),
  async execute(interaction, s) {
    await interaction.deferReply();
    const loaded = await loadPlayer(interaction, s);
    if (!loaded) return;
    const { profile } = loaded;
    const bucket = (interaction.options.getString("mods") as PracticeBucket | null) ?? undefined;
    const starsAsked = interaction.options.getNumber("stars") ?? undefined;
    const stars = starsAsked === undefined ? undefined : Math.round(starsAsked * 100) / 100;
    const count = interaction.options.getInteger("count") ?? 10;
    const key = `${profile.osuId}:${bucket ?? "-"}:${stars ?? "-"}:${count}`;
    let result: Awaited<ReturnType<typeof pick>> | undefined = picks.get(key);
    if (result === undefined) {
      let scores = tops.get(profile.osuId);
      if (!scores) {
        scores = await s.osu.getUserScores(profile.osuId, "best", { ruleset: "osu", limit: 100 });
        tops.set(profile.osuId, scores);
      }
      result = await pick(s, scores, { bucket, stars, count });
      if (typeof result === "object" || result === "none") picks.set(key, result);
    }
    if (result === "no-plays")
      return void (await fail(
        interaction,
        `No ${bucket ? `${bucket} ` : ""}plays in your top 100 to go on.`,
      ));
    if (result === "fm")
      return void (await fail(
        interaction,
        "Your top 100 is mostly mixed mods. Pick `mods` (NM, HD, HR or DT).",
      ));
    if (result === "unavailable")
      return void (await fail(interaction, "pools.haruhime.moe didn't answer. Try again soon."));
    if (result === "none")
      return void (await fail(interaction, "pools found nothing close enough. Try other stars."));
    const { target, maps } = result;
    const name = `${profile.username}'s ${target.bucket} practice`;
    const subtitle = `${target.bucket} · ${target.stars.toFixed(2)}★ · like your top plays`;
    const packUrl = `${LINKS.packs}/k#${encodePackKey({
      name,
      slots: maps.map((map, i) => ({ mod: target.bucket, index: i + 1, beatmapId: map.beatmapId })),
    })}`;
    const first = maps[0] as Candidate;
    const png = await s.cards.draw(
      "pool",
      toPracticeCard({ name, subtitle, bucket: target.bucket, maps }),
    );
    await interaction.editReply(
      imageOrEmbed(
        png,
        "practice.png",
        () =>
          card({
            author: { name: "pools.haruhime.moe", url: LINKS.pools },
            title: name,
            url: packUrl,
            description: [
              `-# ${subtitle}`,
              ...maps.map(
                (map, i) =>
                  `\`${target.bucket}${i + 1}\` [${map.title}](${beatmapUrl(map.beatmapId)}) · ${map.stars.toFixed(2)}★`,
              ),
            ]
              .join("\n")
              .slice(0, 4000),
          }),
        linkButtons([
          { label: "Open as a pack", url: packUrl },
          { label: "First map", url: beatmapUrl(first.beatmapId) },
        ]),
      ),
    );
  },
};
