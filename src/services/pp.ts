/**
 * @file src/services/pp.ts
 * @desc pp with rosu-pp-js (the calculator tosu uses), from a .osu file: a map's pp at a few
 *       accuracies, a score's pp and its full-combo pp, and a made-up score for /simulate. Every
 *       WASM object is freed before returning. Lazer scores are judged as lazer, stable scores
 *       (legacy total score above 0) as stable.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import type { Ruleset } from "@haruhimemoe/harumin-config";
import type { OsuMod, OsuScore } from "@haruhimemoe/osu";
import * as rosu from "rosu-pp-js";

const GAME_MODE: Readonly<Record<Ruleset, rosu.GameMode>> = Object.freeze({
  osu: rosu.GameMode.Osu,
  taiko: rosu.GameMode.Taiko,
  fruits: rosu.GameMode.Catch,
  mania: rosu.GameMode.Mania,
});

/** A map with mods applied: difficulty and the stats players read. */
export type MapAttributes = {
  stars: number;
  maxCombo: number;
  ar: number | null;
  od: number | null;
  cs: number;
  hp: number;
  clockRate: number;
};

/** pp at one accuracy. */
export type AccuracyPp = { accuracy: number; pp: number };

/** A score recalculated: what it's worth now, and as a full combo. */
export type ScorePp = {
  pp: number;
  fcPp: number;
  fcAccuracy: number;
  stars: number;
  maxCombo: number;
};

/** /simulate's input. */
export type SimulateInput = {
  ruleset?: Ruleset | undefined;
  mods: readonly OsuMod[];
  accuracy?: number | undefined;
  combo?: number | undefined;
  misses?: number | undefined;
};

const withMap = <T>(
  bytes: Uint8Array,
  ruleset: Ruleset | undefined,
  mods: readonly OsuMod[],
  use: (map: rosu.Beatmap) => T,
): T => {
  const map = new rosu.Beatmap(bytes);
  try {
    // rosu reads anything; a file with no hit objects isn't a beatmap and would say 0pp.
    if (map.nObjects === 0) throw new Error("not a beatmap: no hit objects");
    if (ruleset && map.mode === rosu.GameMode.Osu && ruleset !== "osu") {
      map.convert(GAME_MODE[ruleset], [...mods]);
    }
    return use(map);
  } finally {
    map.free();
  }
};

const performance = (map: rosu.Beatmap, args: rosu.PerformanceArgs) => {
  const calculator = new rosu.Performance(args);
  try {
    const result = calculator.calculate(map);
    const out = {
      pp: result.pp,
      stars: result.difficulty.stars,
      maxCombo: result.difficulty.maxCombo,
    };
    result.free();
    return out;
  } finally {
    calculator.free();
  }
};

/**
 * @function mapAttributes
 * @param bytes {Uint8Array} the .osu file
 * @param mods {readonly OsuMod[]} mods (rate changes included)
 * @param ruleset {Ruleset | undefined} a convert's ruleset
 * @returns {MapAttributes} stars, max combo and AR/OD/CS/HP after mods
 */
export const mapAttributes = (
  bytes: Uint8Array,
  mods: readonly OsuMod[],
  ruleset?: Ruleset,
): MapAttributes =>
  withMap(bytes, ruleset, mods, (map) => {
    const difficulty = new rosu.Difficulty({ mods: [...mods] });
    try {
      const attrs = difficulty.calculate(map);
      // build() takes the builder: nothing left to free.
      const stats = new rosu.BeatmapAttributesBuilder({ map, mods: [...mods] }).build();
      const out: MapAttributes = {
        stars: attrs.stars,
        maxCombo: attrs.maxCombo,
        ar: stats.ar,
        od: stats.od,
        cs: stats.cs,
        hp: stats.hp,
        clockRate: stats.clockRate,
      };
      attrs.free();
      stats.free();
      return out;
    } finally {
      difficulty.free();
    }
  });

/**
 * @function ppAtAccuracies
 * @param bytes {Uint8Array} the .osu file
 * @param mods {readonly OsuMod[]} mods
 * @param accuracies {readonly number[]} percents, e.g. [95, 98, 99, 100]
 * @param ruleset {Ruleset | undefined} a convert's ruleset
 * @returns {AccuracyPp[]} pp for a full combo at each accuracy
 */
export const ppAtAccuracies = (
  bytes: Uint8Array,
  mods: readonly OsuMod[],
  accuracies: readonly number[],
  ruleset?: Ruleset,
): AccuracyPp[] =>
  withMap(bytes, ruleset, mods, (map) =>
    accuracies.map((accuracy) => ({
      accuracy,
      pp: performance(map, { mods: [...mods], accuracy, lazer: true }).pp,
    })),
  );

const isStable = (score: Pick<OsuScore, "legacyTotalScore">) => (score.legacyTotalScore ?? 0) > 0;

/**
 * @function scoreArgs
 * @param score {OsuScore} a score
 * @returns {rosu.PerformanceArgs} its judgements in rosu's terms
 */
export const scoreArgs = (score: OsuScore): rosu.PerformanceArgs => {
  const s = (key: string) => score.statistics[key] ?? 0;
  const base: rosu.PerformanceArgs = {
    mods: [...score.mods],
    combo: score.maxCombo,
    lazer: !isStable(score),
  };
  switch (score.ruleset) {
    case "osu":
      return {
        ...base,
        n300: s("great"),
        n100: s("ok"),
        n50: s("meh"),
        misses: s("miss"),
        largeTickHits: s("large_tick_hit"),
        smallTickHits: s("small_tick_hit"),
        sliderEndHits: s("slider_tail_hit"),
      };
    case "taiko":
      return { ...base, n300: s("great"), n100: s("ok"), misses: s("miss") };
    case "fruits":
      return {
        ...base,
        n300: s("great"),
        n100: s("large_tick_hit"),
        n50: s("small_tick_hit"),
        nKatu: s("small_tick_miss"),
        misses: s("miss") + s("large_tick_miss"),
      };
    case "mania":
      return {
        ...base,
        nGeki: s("perfect"),
        n300: s("great"),
        nKatu: s("good"),
        n100: s("ok"),
        n50: s("meh"),
        misses: s("miss"),
      };
  }
};

/**
 * @function fullComboArgs
 * @param score {OsuScore} a score
 * @returns {rosu.PerformanceArgs} the same play with every miss turned into the best judgement
 *          and full combo (combo left to rosu, which fills the map's max)
 */
export const fullComboArgs = (score: OsuScore): rosu.PerformanceArgs => {
  const args = scoreArgs(score);
  const misses = args.misses ?? 0;
  const max = (key: string) => score.maximumStatistics?.[key];
  const full: rosu.PerformanceArgs = { ...args, misses: 0 };
  delete full.combo;
  if (score.ruleset === "mania") full.nGeki = (args.nGeki ?? 0) + misses;
  else if (score.ruleset === "fruits") {
    full.n300 = (args.n300 ?? 0) + (score.statistics.miss ?? 0);
    full.n100 = (args.n100 ?? 0) + (score.statistics.large_tick_miss ?? 0);
  } else full.n300 = (args.n300 ?? 0) + misses;
  if (score.ruleset === "osu") {
    const ticks = max("large_tick_hit");
    const tails = max("slider_tail_hit");
    if (ticks !== undefined) full.largeTickHits = ticks;
    if (tails !== undefined) full.sliderEndHits = tails;
  }
  return full;
};

/**
 * @function scorePp
 * @param bytes {Uint8Array} the .osu file
 * @param score {OsuScore} a score on it
 * @returns {ScorePp} its pp, its full-combo pp and that accuracy, stars and max combo
 */
export const scorePp = (bytes: Uint8Array, score: OsuScore): ScorePp =>
  withMap(bytes, score.ruleset, score.mods, (map) => {
    const now = performance(map, scoreArgs(score));
    const calculator = new rosu.Performance(fullComboArgs(score));
    try {
      const fc = calculator.calculate(map);
      const state = fc.state;
      const fcAccuracy = state ? accuracyOf(state, score.ruleset) : score.accuracy * 100;
      const out: ScorePp = {
        pp: now.pp,
        fcPp: fc.pp,
        fcAccuracy,
        stars: now.stars,
        maxCombo: now.maxCombo,
      };
      fc.free();
      return out;
    } finally {
      calculator.free();
    }
  });

/**
 * @function accuracyOf
 * @param state {rosu.ScoreState} judgements
 * @param ruleset {Ruleset} the ruleset (each weighs judgements differently)
 * @returns {number} percent, 0 to 100 (lazer's formulas, slider ticks left out)
 */
export const accuracyOf = (state: rosu.ScoreState, ruleset: Ruleset): number => {
  const n300 = state.n300 ?? 0;
  const n100 = state.n100 ?? 0;
  const n50 = state.n50 ?? 0;
  const miss = state.misses ?? 0;
  const geki = state.nGeki ?? 0;
  const katu = state.nKatu ?? 0;
  let hit = 0;
  let total = 0;
  if (ruleset === "osu") {
    hit = 300 * n300 + 100 * n100 + 50 * n50;
    total = 300 * (n300 + n100 + n50 + miss);
  } else if (ruleset === "taiko") {
    hit = 2 * n300 + n100;
    total = 2 * (n300 + n100 + miss);
  } else if (ruleset === "fruits") {
    hit = n300 + n100 + n50;
    total = n300 + n100 + n50 + katu + miss;
  } else {
    hit = 305 * geki + 300 * n300 + 200 * katu + 100 * n100 + 50 * n50;
    total = 305 * (geki + n300 + katu + n100 + n50 + miss);
  }
  return total === 0 ? 100 : (hit / total) * 100;
};

/**
 * @function simulate
 * @param bytes {Uint8Array} the .osu file
 * @param input {SimulateInput} mods, accuracy (percent), combo and misses
 * @returns {{ pp: number; stars: number; maxCombo: number }} the made-up score's pp
 */
export const simulate = (
  bytes: Uint8Array,
  { ruleset, mods, accuracy, combo, misses }: SimulateInput,
): { pp: number; stars: number; maxCombo: number } =>
  withMap(bytes, ruleset, mods, (map) => {
    const args: rosu.PerformanceArgs = { mods: [...mods], lazer: true };
    if (accuracy !== undefined) args.accuracy = accuracy;
    if (combo !== undefined) args.combo = combo;
    if (misses !== undefined) args.misses = misses;
    const { pp, stars, maxCombo } = performance(map, args);
    return { pp, stars, maxCombo };
  });
