/**
 * @file src/services/renders.ts
 * @desc The /render queue: replays wait in line and go to o!rdr one at a time, at most one start
 *       per gap (5 minutes without an o!rdr key, which is o!rdr's limit). A render that started
 *       is followed to its video while the next one waits its turn. One replay per person in
 *       line, ten in line at most. The line lives in memory: a restart drops it.
 * @author David @dvhsh (https://dvh.sh)
 * @created Sat Oct 10, 2026
 * @modified Sat Oct 10, 2026
 */

import { type OrdrClient, OrdrError } from "@haruhimemoe/ordr";

/** o!rdr's limit without a key: one render per 5 minutes. */
export const RENDER_GAP_MS = 5 * 60_000;
/** How many replays may wait at once. */
export const MAX_QUEUED = 10;

/** Where a job is, as the person who asked sees it. */
export type RenderState =
  | { kind: "queued"; position: number; startsInMs: number }
  | { kind: "rendering"; progress: string }
  | { kind: "done"; videoUrl: string }
  | { kind: "failed"; message: string };

/** One replay to render. */
export type RenderJob = {
  /** Who asked (one job each). */
  userId: string;
  replayUrl: string;
  skin: string;
  onUpdate: (state: RenderState) => void;
};

/** Why a job wasn't taken. */
export type Refusal = "full" | "already";

export type Renders = {
  /** Puts a job in line; its first update (queued) has already been sent when this returns. */
  enqueue: (job: RenderJob) => { ok: true } | { ok: false; reason: Refusal };
  size: () => number;
  stop: () => void;
};

type Options = {
  gapMs?: number;
  maxQueued?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string, error?: unknown) => void;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * @function failureText
 * @param error {unknown} what o!rdr or the wait threw
 * @returns {string} what to tell the person
 */
export const failureText = (error: unknown): string =>
  error instanceof OrdrError ? `o!rdr said no: ${error.message}` : "o!rdr didn't answer.";

/**
 * @function createRenders
 * @param ordr {Pick<OrdrClient, "createRender" | "waitForRender">} the o!rdr client
 * @param options {Options} the gap and line size, and the clock (tests)
 * @returns {Renders} the queue
 */
export const createRenders = (
  ordr: Pick<OrdrClient, "createRender" | "waitForRender">,
  options: Options = {},
): Renders => {
  const gapMs = options.gapMs ?? RENDER_GAP_MS;
  const maxQueued = options.maxQueued ?? MAX_QUEUED;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const log = options.log ?? (() => undefined);
  const line: RenderJob[] = [];
  /** When the last render went to o!rdr, or o!rdr told us to wait until. */
  let nextStart = 0;
  let running = false;
  let stopped = false;

  const startsIn = (position: number) => Math.max(0, nextStart - now()) + (position - 1) * gapMs;

  const announce = () => {
    line.forEach((job, i) => {
      job.onUpdate({ kind: "queued", position: i + 1, startsInMs: startsIn(i + 1) });
    });
  };

  const follow = async (job: RenderJob, renderId: number) => {
    try {
      const { videoUrl } = await ordr.waitForRender(renderId, {
        onProgress: ({ progress }) => job.onUpdate({ kind: "rendering", progress }),
      });
      job.onUpdate({ kind: "done", videoUrl });
    } catch (error) {
      log(`render ${renderId} failed`, error);
      job.onUpdate({ kind: "failed", message: failureText(error) });
    }
  };

  const work = async () => {
    running = true;
    while (!stopped && line.length > 0) {
      const wait = nextStart - now();
      if (wait > 0) await sleep(wait);
      if (stopped) break;
      const job = line[0] as RenderJob;
      try {
        const { renderId } = await ordr.createRender({
          replayUrl: job.replayUrl,
          skin: job.skin,
          resolution: "1280x720",
        });
        line.shift();
        nextStart = now() + gapMs;
        job.onUpdate({ kind: "rendering", progress: "Sent to o!rdr" });
        void follow(job, renderId);
      } catch (error) {
        if (error instanceof OrdrError && error.retryable) {
          // Keep it first in line and try again when o!rdr says (or after a gap).
          nextStart = now() + (error.retryAfterMs ?? gapMs);
        } else {
          line.shift();
          log("render refused", error);
          job.onUpdate({ kind: "failed", message: failureText(error) });
        }
      }
      announce();
    }
    running = false;
  };

  return {
    enqueue: (job) => {
      if (line.some((queued) => queued.userId === job.userId))
        return { ok: false, reason: "already" };
      if (line.length >= maxQueued) return { ok: false, reason: "full" };
      line.push(job);
      job.onUpdate({ kind: "queued", position: line.length, startsInMs: startsIn(line.length) });
      if (!running) void work();
      return { ok: true };
    },
    size: () => line.length,
    stop: () => {
      stopped = true;
    },
  };
};
