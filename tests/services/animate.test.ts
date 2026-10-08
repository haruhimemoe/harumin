/**
 * @file tests/services/animate.test.ts
 * @desc Animated covers: which covers count, ffmpeg's arguments, fetch and ffmpeg failures read
 *       as null, the smaller retry for a large gif, the cache, and /osu's choice between the gif,
 *       the still card and nothing.
 * @author David @dvhsh (https://dvh.sh)
 * @created Wed Oct 7, 2026
 * @modified Wed Oct 7, 2026
 */

import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { drawProfile } from "../../src/commands/osu.ts";
import {
  createAnimator,
  ffmpegArgs,
  isAnimatedCover,
  MAX_GIF_BYTES,
  type Runner,
} from "../../src/services/animate.ts";
import { makeProfile } from "../helpers.ts";

const GIF_URL = "https://assets.ppy.sh/user-profile-covers/2/x.gif";
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const dir = join(tmpdir(), "harumin-gif-test");

const gifFetch = vi.fn(async () => new Response(GIF));

/** A runner that writes `size` bytes to ffmpeg's output path and exits `code`. */
const fakeRunner = (sizes: number[], code: number | null = 0): Runner & { calls: string[][] } => {
  const calls: string[][] = [];
  const run: Runner = async (args) => {
    calls.push(args);
    const size = sizes[calls.length - 1] ?? 10;
    if (code === 0) await writeFile(args[args.length - 1] as string, new Uint8Array(size));
    return code;
  };
  return Object.assign(run, { calls });
};

describe("isAnimatedCover", () => {
  it("only takes gifs on assets.ppy.sh", () => {
    expect(isAnimatedCover(GIF_URL)).toBe(true);
    expect(isAnimatedCover(`${GIF_URL}?v=2`)).toBe(true);
    expect(isAnimatedCover("https://assets.ppy.sh/c.jpeg")).toBe(false);
    expect(isAnimatedCover("https://evil.example/x.gif")).toBe(false);
    expect(isAnimatedCover(null)).toBe(false);
  });
});

describe("ffmpegArgs", () => {
  it("lays the cover under the card in the cover box, 6 s, looping", () => {
    const args = ffmpegArgs(
      { cover: "c.gif", card: "k.png", out: "o.gif" },
      { fps: 15, colors: 200 },
    );
    const filter = args[args.indexOf("-filter_complex") + 1];
    expect(filter).toContain("fps=15");
    expect(filter).toContain("crop=974:170");
    expect(filter).toContain("pad=1000:490:13:13");
    expect(filter).toContain("max_colors=200");
    expect(args.slice(-3)).toEqual(["-loop", "0", "o.gif"]);
  });
});

describe("createAnimator", () => {
  it("makes the gif, and reuses it for the same card", async () => {
    const run = fakeRunner([1000]);
    const animator = createAnimator({ dir, run, fetch: gifFetch });
    expect((await animator.profile(PNG, GIF_URL, "k"))?.length).toBe(1000);
    expect((await animator.profile(PNG, GIF_URL, "k"))?.length).toBe(1000);
    expect(run.calls).toHaveLength(1);
  });

  it("redoes a large gif smaller, then gives up", async () => {
    const run = fakeRunner([MAX_GIF_BYTES + 1, 500]);
    const animator = createAnimator({ dir, run, fetch: gifFetch });
    expect((await animator.profile(PNG, GIF_URL, "a"))?.length).toBe(500);
    expect(run.calls[1]?.join(" ")).toContain("fps=10");
    const tooBig = fakeRunner([MAX_GIF_BYTES + 1, MAX_GIF_BYTES + 1]);
    const log = vi.fn();
    expect(
      await createAnimator({ dir, run: tooBig, fetch: gifFetch, log }).profile(PNG, GIF_URL, "b"),
    ).toBeNull();
    expect(log).toHaveBeenCalledWith("animated card too large");
  });

  it("reads ffmpeg failures and bad covers as null", async () => {
    const log = vi.fn();
    for (const code of [1, null]) {
      const animator = createAnimator({ dir, run: fakeRunner([], code), fetch: gifFetch, log });
      expect(await animator.profile(PNG, GIF_URL, `c${code}`)).toBeNull();
    }
    const run = fakeRunner([10]);
    const answers = [
      async () => new Response(PNG),
      async () => new Response("", { status: 404 }),
      async () => new Response(GIF, { headers: { "content-length": String(MAX_GIF_BYTES + 1) } }),
      async () => {
        throw new Error("timeout");
      },
    ];
    for (const fetch of answers) {
      expect(await createAnimator({ dir, run, fetch }).profile(PNG, GIF_URL, "d")).toBeNull();
    }
    expect(run.calls).toHaveLength(0);
  });
});

describe("drawProfile", () => {
  const cards = (answer: Buffer | null) => ({ draw: vi.fn(async () => answer) });
  const still = Buffer.from(PNG);

  it("sends the gif for a gif cover, drawn with a hole", async () => {
    const s = {
      cards: cards(still),
      animate: { profile: vi.fn(async () => Buffer.from(GIF)) },
    };
    const drawn = await drawProfile(s, makeProfile({ coverUrl: GIF_URL }), "osu");
    expect(drawn?.name).toBe("profile.gif");
    expect(s.cards.draw).toHaveBeenCalledWith(
      "profile",
      expect.objectContaining({ cover: "hole" }),
    );
  });

  it("falls back to the still card, then to nothing", async () => {
    const s = { cards: cards(still), animate: { profile: vi.fn(async () => null) } };
    expect((await drawProfile(s, makeProfile({ coverUrl: GIF_URL }), "osu"))?.name).toBe(
      "profile.png",
    );
    const plain = { cards: cards(still), animate: { profile: vi.fn() } };
    expect((await drawProfile(plain, makeProfile(), "osu"))?.name).toBe("profile.png");
    expect(plain.animate.profile).not.toHaveBeenCalled();
    const none = { cards: cards(null), animate: { profile: vi.fn() } };
    expect(await drawProfile(none, makeProfile(), "osu")).toBeNull();
  });
});
