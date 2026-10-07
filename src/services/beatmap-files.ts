/**
 * @file src/services/beatmap-files.ts
 * @desc .osu files for pp, from osu! itself (https://osu.ppy.sh/osu/{id}), checked against the
 *       API's MD5 when we have it and cached on disk, newest 500 kept. Only .osu text: harumin
 *       never downloads, stores or sends .osz archives. Concurrent asks for one map share a fetch.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import { USER_AGENT } from "../constants.ts";

/** The cache. */
export type BeatmapFiles = {
  /** The .osu bytes, or null when osu! has none or it doesn't match the checksum. */
  get: (beatmapId: number, checksum?: string | null) => Promise<Uint8Array | null>;
};

/** createBeatmapFiles' options. */
export type BeatmapFilesOptions = {
  dir: string;
  maxFiles?: number;
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
  /** Asked before each download (the shared osu! budget). */
  beforeFetch?: () => Promise<boolean>;
};

const MAX_BYTES = 8 * 1024 * 1024;

const md5 = (bytes: Uint8Array): string => createHash("md5").update(bytes).digest("hex");

/**
 * @function createBeatmapFiles
 * @param options {BeatmapFilesOptions} the cache directory, cap, fetch and budget
 * @returns {BeatmapFiles} the cache
 */
export const createBeatmapFiles = ({
  dir,
  maxFiles = 500,
  fetch = globalThis.fetch,
  beforeFetch = async () => true,
}: BeatmapFilesOptions): BeatmapFiles => {
  const inFlight = new Map<number, Promise<Uint8Array | null>>();
  let writes = 0;

  const prune = async () => {
    const names = (await readdir(dir)).filter((name) => name.endsWith(".osu"));
    if (names.length <= maxFiles) return;
    const dated = await Promise.all(
      names.map(async (name) => ({ name, at: (await stat(path.join(dir, name))).mtimeMs })),
    );
    dated.sort((a, b) => a.at - b.at);
    for (const { name } of dated.slice(0, dated.length - maxFiles)) {
      await rm(path.join(dir, name), { force: true });
    }
  };

  const download = async (
    beatmapId: number,
    checksum: string | null,
  ): Promise<Uint8Array | null> => {
    const file = path.join(dir, `${beatmapId}.osu`);
    try {
      const cached = new Uint8Array(await readFile(file));
      if (!checksum || md5(cached) === checksum) {
        const now = new Date();
        await utimes(file, now, now).catch(() => undefined);
        return cached;
      }
    } catch {
      // Not cached yet.
    }
    if (!(await beforeFetch())) return null;
    const response = await fetch(`https://osu.ppy.sh/osu/${beatmapId}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_BYTES) return null;
    if (checksum && md5(bytes) !== checksum) return null;
    await mkdir(dir, { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    await writeFile(temp, bytes);
    await rename(temp, file);
    writes += 1;
    if (writes % 25 === 0) await prune().catch(() => undefined);
    return bytes;
  };

  return {
    get(beatmapId, checksum = null) {
      const pending = inFlight.get(beatmapId);
      if (pending) return pending;
      const job = download(beatmapId, checksum).finally(() => inFlight.delete(beatmapId));
      inFlight.set(beatmapId, job);
      return job;
    },
  };
};
