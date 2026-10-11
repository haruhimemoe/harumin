/**
 * @file tests/views/replay.test.ts
 * @desc An .osr as a score: the header becomes an API-shaped score on the found map, a file that
 *       isn't a replay or a map osu! doesn't know is refused, a missing player still loads, and
 *       the one-line fallback.
 * @author David @dvhsh (https://dvh.sh)
 * @created Sat Oct 10, 2026
 * @modified Sat Oct 10, 2026
 */

import type { ReplayHeader } from "@haruhimemoe/osu/replay";
import { describe, expect, it, vi } from "vitest";
import { loadReplay, replayLine, toReplayScore } from "../../src/views/replay.ts";
import { makeMap, makeProfile } from "../helpers.ts";

const MD5 = "a5b99395a42bd55bc5eb1d2411cbdf8b";

const header: ReplayHeader = {
  ruleset: "osu",
  version: 20260101,
  beatmapMd5: MD5,
  username: "peppy",
  counts: { n300: 300, n100: 4, n50: 1, geki: 0, katu: 0, miss: 1 },
  totalScore: 912345,
  maxCombo: 300,
  perfect: false,
  modFlags: 8,
  mods: ["HD"],
  playedAt: "2026-10-10T00:00:00.000Z",
  scoreId: null,
};

/** The header above as .osr bytes. */
const osr = (md5 = MD5): Uint8Array => {
  const out: number[] = [];
  const view = (size: number, set: (d: DataView) => void) => {
    const d = new DataView(new ArrayBuffer(size));
    set(d);
    out.push(...new Uint8Array(d.buffer));
  };
  const text = (value: string) => out.push(0x0b, value.length, ...new TextEncoder().encode(value));
  out.push(0);
  view(4, (d) => d.setInt32(0, 20260101, true));
  text(md5);
  text("peppy");
  text("f".repeat(32));
  for (const n of [300, 4, 1, 0, 0, 1]) view(2, (d) => d.setUint16(0, n, true));
  view(4, (d) => d.setInt32(0, 912345, true));
  view(2, (d) => d.setUint16(0, 300, true));
  out.push(0);
  view(4, (d) => d.setInt32(0, 8, true));
  text("");
  view(8, (d) => d.setBigInt64(0, 638_000_000_000_000_000n, true));
  view(4, (d) => d.setInt32(0, 0, true));
  return new Uint8Array(out);
};

const services = (found = true, profile = true) => ({
  osu: {
    getBeatmapByChecksum: vi.fn(async () => (found ? makeMap({ checksum: MD5 }) : null)),
    getUserProfile: vi.fn(async () => (profile ? makeProfile() : null)),
  },
  beatmaps: { get: vi.fn(async () => null) },
});

describe("toReplayScore", () => {
  it("shapes the replay like an API score on its map", () => {
    const score = toReplayScore(header, makeMap({ checksum: MD5 }), 2);
    expect(score).toMatchObject({
      userId: 2,
      beatmapId: 75,
      mods: [{ acronym: "HD" }],
      statistics: { great: 300, ok: 4, meh: 1, miss: 1 },
      rank: "A",
      pp: null,
      passed: true,
      beatmap: { checksum: MD5, maxCombo: 314 },
      beatmapset: { title: "DISCOPRINCE" },
    });
  });
});

describe("loadReplay", () => {
  it("loads a replay with its map and player", async () => {
    const s = services();
    const loaded = await loadReplay(s as never, osr());
    expect(loaded.ok).toBe(true);
    expect(s.osu.getBeatmapByChecksum).toHaveBeenCalledWith(MD5);
    expect(s.osu.getUserProfile).toHaveBeenCalledWith("peppy", { ruleset: "osu" });
  });

  it("refuses junk and unknown maps, and loads without a player", async () => {
    expect(await loadReplay(services() as never, new Uint8Array([1, 2]))).toEqual({
      ok: false,
      problem: "unreadable",
    });
    expect(await loadReplay(services(false) as never, osr())).toEqual({
      ok: false,
      problem: "unknown_map",
    });
    const loaded = await loadReplay(services(true, false) as never, osr());
    expect(loaded.ok && loaded.replay.profile).toBeNull();
    if (loaded.ok) {
      expect(replayLine(loaded.replay)).toBe(
        "**Kenji Ninuma - DISCOPRINCE [Normal]** +HD · 98.53% · 300x · A · peppy",
      );
    }
  });
});
