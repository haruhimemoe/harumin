/**
 * @file tests/links/links.test.ts
 * @desc Link detection: every beatmap link shape, matches, packs and pack keys, pools, bb, hosts
 *       outside the allowlist, dedupe and the per-message cap.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { describe, expect, it } from "vitest";
import {
  beatmapIdFromUrl,
  findLinks,
  parseMapInput,
  refFromUrl,
  refId,
  settingFor,
} from "../../src/links/index.ts";

const ref = (href: string) => refFromUrl(new URL(href));

describe("beatmap links", () => {
  it.each([
    ["https://osu.ppy.sh/b/75", 75],
    ["https://osu.ppy.sh/beatmaps/75", 75],
    ["https://osu.ppy.sh/beatmapsets/1#osu/75", 75],
    ["https://osu.ppy.sh/beatmapsets/1#mania/75", 75],
    ["https://osu.ppy.sh/beatmapsets/1/75", 75],
    ["https://old.ppy.sh/p/beatmap?b=75", 75],
  ])("%s", (href, id) => {
    expect(beatmapIdFromUrl(new URL(href))).toBe(id);
  });

  it("refuses set-only links, other hosts and junk ids", () => {
    expect(beatmapIdFromUrl(new URL("https://osu.ppy.sh/beatmapsets/1"))).toBeNull();
    expect(beatmapIdFromUrl(new URL("https://evil.example/b/75"))).toBeNull();
    expect(beatmapIdFromUrl(new URL("https://osu.ppy.sh/b/0"))).toBeNull();
    expect(beatmapIdFromUrl(new URL("https://osu.ppy.sh/b/99999999999"))).toBeNull();
    expect(beatmapIdFromUrl(new URL("https://osu.ppy.sh/users/2"))).toBeNull();
  });

  it("reads option input", () => {
    expect(parseMapInput(" 75 ")).toBe(75);
    expect(parseMapInput("osu.ppy.sh/b/75")).toBe(75);
    expect(parseMapInput("https://osu.ppy.sh/beatmapsets/1")).toBeNull();
    expect(parseMapInput("not a link at all")).toBeNull();
  });
});

describe("refFromUrl", () => {
  it("reads every app", () => {
    expect(ref("https://osu.ppy.sh/community/matches/111")).toEqual({ key: "match", matchId: 111 });
    expect(ref("https://osu.ppy.sh/mp/111")).toEqual({ key: "match", matchId: 111 });
    expect(ref("https://packs.haruhime.moe/p/AbCdEfGhIj")).toEqual({
      key: "pack",
      slug: "AbCdEfGhIj",
    });
    expect(ref("https://packs.haruhime.moe/k#pk1.AAAA")).toEqual({
      key: "packKey",
      packKey: "pk1.AAAA",
    });
    expect(ref("https://pools.haruhime.moe/pools/abc123")).toEqual({
      key: "pool",
      poolId: "abc123",
    });
    expect(ref("https://bb.haruhime.moe/t/abc123")).toEqual({ key: "bb", templateId: "abc123" });
  });

  it("ignores everything else", () => {
    expect(ref("https://osu.ppy.sh/home")).toBeNull();
    expect(ref("https://packs.haruhime.moe/p/short")).toBeNull();
    expect(ref("https://packs.haruhime.moe/docs")).toBeNull();
    expect(ref("https://pools.haruhime.moe/search")).toBeNull();
    expect(ref("https://bb.haruhime.moe/docs")).toBeNull();
    expect(ref("https://packs.haruhime.moe.evil.example/p/AbCdEfGhIj")).toBeNull();
    expect(ref("ftp://osu.ppy.sh/b/75")).toBeNull();
  });
});

describe("findLinks", () => {
  it("finds links and bare pack keys in order, without duplicates, at most three", () => {
    const found = findLinks(
      "look https://osu.ppy.sh/b/75 and https://osu.ppy.sh/b/75 then pk2.Zm9vYmFy and https://pools.haruhime.moe/pools/abcdef https://osu.ppy.sh/b/76",
    );
    expect(found).toEqual([
      { key: "map", beatmapId: 75 },
      { key: "pool", poolId: "abcdef" },
      { key: "map", beatmapId: 76 },
    ]);
    expect(findLinks("just pk2.Zm9vYmFy")).toEqual([{ key: "packKey", packKey: "pk2.Zm9vYmFy" }]);
    expect(findLinks("https://[broken")).toEqual([]);
    expect(findLinks("nothing here")).toEqual([]);
  });

  it("maps refs to settings and ids", () => {
    expect(settingFor({ key: "packKey", packKey: "pk1.x" })).toBe("pack");
    expect(settingFor({ key: "bb", templateId: "x" })).toBe("bb");
    expect(
      [
        { key: "map", beatmapId: 1 },
        { key: "match", matchId: 2 },
        { key: "pack", slug: "s" },
        { key: "packKey", packKey: "k" },
        { key: "pool", poolId: "p" },
        { key: "bb", templateId: "t" },
      ].map((each) => refId(each as Parameters<typeof refId>[0])),
    ).toEqual(["map:1", "match:2", "pack:s", "packKey:k", "pool:p", "bb:t"]);
  });
});
