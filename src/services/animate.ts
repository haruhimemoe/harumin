/**
 * @file src/services/animate.ts
 * @desc Animated profile covers: the site draws the card with the cover box left transparent,
 *       this fetches the gif cover from assets.ppy.sh and has ffmpeg lay each frame under the
 *       card (scaled and cropped to CARD_LAYOUT's box, 15 fps, 6 s at most, one shared palette).
 *       One ffmpeg job at a time; a job that waits more than 10 s, a gif over 8 MB, an ffmpeg
 *       that's missing, fails or runs past 8 s all come back as null and /osu sends the still
 *       card. An output over 8 MB is redone smaller once. Finished gifs are kept 10 minutes.
 * @author David @dvhsh (https://dvh.sh)
 * @created Wed Oct 7, 2026
 * @modified Wed Oct 7, 2026
 */

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CARD_LAYOUT } from "@haruhimemoe/harumin-config";
import { USER_AGENT } from "../constants.ts";
import { createTtlCache } from "./cache.ts";

/** The largest gif cover fetched, and the largest gif sent (Discord takes 10 MB from bots). */
export const MAX_GIF_BYTES = 8 * 1024 * 1024;

/** One encode's settings: the first try, then the smaller retry. */
const PASSES = [
  { fps: 15, colors: 200 },
  { fps: 10, colors: 96 },
] as const;

/** Runs a command; resolves its exit code, or null when it couldn't start or was killed. */
export type Runner = (args: string[], timeoutMs: number) => Promise<number | null>;

/** The animator. */
export type Animator = {
  /**
   * @param card {Uint8Array} the profile card PNG drawn with `cover: "hole"`
   * @param coverUrl {string} the gif cover (assets.ppy.sh)
   * @param key {string} what the card shows (osu! id, ruleset, numbers), for the cache
   * @returns {Promise<Buffer | null>} the animated card, or null
   */
  profile: (card: Uint8Array, coverUrl: string, key: string) => Promise<Buffer | null>;
};

/** createAnimator's options. */
export type AnimatorOptions = {
  ffmpeg?: string;
  /** Where the work files go (default the system temp dir). */
  dir?: string;
  run?: Runner;
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
  log?: (message: string, error?: unknown) => void;
};

/**
 * @function isAnimatedCover
 * @param url {string | null} a profile cover URL
 * @returns {boolean} whether it's a gif on assets.ppy.sh
 */
export const isAnimatedCover = (url: string | null): url is string =>
  Boolean(url?.startsWith("https://assets.ppy.sh/") && /\.gif(?:\?|$)/i.test(url ?? ""));

/**
 * @function ffmpegArgs
 * @param files {{ cover: string; card: string; out: string }} the paths
 * @param pass {{ fps: number; colors: number }} frame rate and palette size
 * @returns {string[]} ffmpeg's arguments: cover under card, 6 s, looping forever
 */
export const ffmpegArgs = (
  files: { cover: string; card: string; out: string },
  pass: { fps: number; colors: number },
): string[] => {
  const { width, height, cover } = CARD_LAYOUT.profile;
  const filter = [
    `[0]fps=${pass.fps},scale=${cover.width}:${cover.height}:force_original_aspect_ratio=increase,crop=${cover.width}:${cover.height},pad=${width}:${height}:${cover.x}:${cover.y}:color=white[bg]`,
    "[bg][1]overlay=0:0:format=auto,split[a][b]",
    `[a]palettegen=max_colors=${pass.colors}:stats_mode=diff[p]`,
    "[b][p]paletteuse=dither=bayer:bayer_scale=4",
  ].join(";");
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-t",
    "6",
    "-i",
    files.cover,
    "-i",
    files.card,
    "-filter_complex",
    filter,
    "-t",
    "6",
    "-loop",
    "0",
    files.out,
  ];
};

/**
 * @function spawnRunner
 * @param ffmpeg {string} the binary
 * @returns {Runner} runs ffmpeg with Bun.spawn, killing it at the timeout
 */
export const spawnRunner =
  (ffmpeg: string): Runner =>
  async (args, timeoutMs) => {
    try {
      const child = Bun.spawn([ffmpeg, ...args], { stdout: "ignore", stderr: "ignore" });
      const timer = setTimeout(() => child.kill(), timeoutMs);
      const code = await child.exited;
      clearTimeout(timer);
      return child.signalCode ? null : code;
    } catch {
      return null;
    }
  };

/**
 * @function createAnimator
 * @param options {AnimatorOptions} ffmpeg, work dir, runner, fetch and log (tests)
 * @returns {Animator} profile(card, coverUrl, key)
 */
export const createAnimator = ({
  ffmpeg = "ffmpeg",
  dir = join(tmpdir(), "harumin-gif"),
  run = spawnRunner(ffmpeg),
  fetch = globalThis.fetch,
  log = () => undefined,
}: AnimatorOptions = {}): Animator => {
  const done = createTtlCache<string, Buffer>(10 * 60_000, 20);
  let queue: Promise<unknown> = Promise.resolve();

  const fetchCover = async (url: string): Promise<Uint8Array | null> => {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(3_000),
      });
      if (!response.ok) return null;
      if (Number(response.headers.get("content-length") ?? 0) > MAX_GIF_BYTES) return null;
      const bytes = new Uint8Array(await response.arrayBuffer());
      const isGif = bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46;
      return isGif && bytes.length <= MAX_GIF_BYTES ? bytes : null;
    } catch {
      return null;
    }
  };

  const encode = async (card: Uint8Array, cover: Uint8Array): Promise<Buffer | null> => {
    const work = join(dir, randomUUID());
    const files = {
      cover: join(work, "cover.gif"),
      card: join(work, "card.png"),
      out: join(work, "out.gif"),
    };
    try {
      await mkdir(work, { recursive: true });
      await Promise.all([writeFile(files.cover, cover), writeFile(files.card, card)]);
      for (const pass of PASSES) {
        const code = await run(ffmpegArgs(files, pass), 8_000);
        if (code !== 0) {
          log(`ffmpeg ${code === null ? "didn't finish" : `exited ${code}`}`);
          return null;
        }
        const gif = await readFile(files.out);
        if (gif.length <= MAX_GIF_BYTES) return gif;
      }
      log("animated card too large");
      return null;
    } catch (error) {
      log("animating a card failed", error);
      return null;
    } finally {
      await rm(work, { recursive: true, force: true }).catch(() => undefined);
    }
  };

  return {
    async profile(card, coverUrl, key) {
      const cacheKey = createHash("sha256").update(key).update(coverUrl).digest("hex");
      const cached = done.get(cacheKey);
      if (cached) return cached;
      const cover = await fetchCover(coverUrl);
      if (!cover) return null;
      const queuedAt = Date.now();
      const job = queue.then(async () => {
        if (Date.now() - queuedAt > 10_000) return null;
        return encode(card, cover);
      });
      queue = job.catch(() => undefined);
      const gif = await job;
      if (gif) done.set(cacheKey, gif);
      return gif;
    },
  };
};
