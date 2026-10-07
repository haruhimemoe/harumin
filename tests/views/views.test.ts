/**
 * @file tests/views/views.test.ts
 * @desc Views and link cards with a fake osu! and the fixture .osu: map cards with and without
 *       the file, score pp, pack keys, saved packs and pools, the content check, every link
 *       card, channel memory from links, and the command export for the site.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { encodePackKey } from "@haruhimemoe/pool";
import { describe, expect, it, vi } from "vitest";
import { exportCommands } from "../../src/export.ts";
import { remember, renderLink } from "../../src/listeners/links.ts";
import { createChannelContext } from "../../src/services/context.ts";
import type { Services } from "../../src/types.ts";
import { renderMap } from "../../src/views/map.ts";
import { tryMapPp, tryScorePp } from "../../src/views/pp.ts";
import { findPackKey, metaFor, renderPoolCheck } from "../../src/views/tools.ts";
import { FIXTURE_OSU, makeMap, makeScore } from "../helpers.ts";

const set = (over: Record<string, unknown> = {}) => ({
  id: 1,
  status: "ranked",
  artist: "Kenji Ninuma",
  title: "DISCOPRINCE",
  artist_unicode: null,
  title_unicode: null,
  source: "",
  tags: "",
  track_id: null,
  availability: { download_disabled: false, more_information: null },
  ...over,
});

const fakeServices = (over: Partial<Services> = {}): Services =>
  ({
    osu: {
      getBeatmap: vi.fn(async (id: number) => (id === 404 ? null : makeMap({ beatmapId: id }))),
      getStarRating: vi.fn(async () => 7.77),
      getBeatmaps: vi.fn(async (ids: number[]) => ({
        found: new Map(ids.map((id) => [id, makeMap({ beatmapId: id })])),
        missing: [],
        unchecked: [],
      })),
      getBeatmapsets: vi.fn(async (ids: number[]) => ({
        sets: new Map(
          ids
            .filter((id) => id !== 3)
            .map((id) => [id, set(id === 2 ? { availability: { download_disabled: true } } : {})]),
        ),
        unchecked: [],
      })),
      getMatch: vi.fn(async (id: number) =>
        id === 404
          ? null
          : {
              match: {
                id,
                name: "OWC",
                startTime: "2026-10-06T00:00:00Z",
                endTime: "2026-10-06T01:00:00Z",
                events: [],
                users: [],
                firstEventId: 1,
                latestEventId: 1,
              },
              complete: true,
            },
      ),
    },
    beatmaps: { get: vi.fn(async (id: number) => (id === 76 ? null : FIXTURE_OSU)) },
    apps: {
      getPack: vi.fn(async (slug: string) =>
        slug === "AbCdEfGhIj"
          ? { slug, name: "Pack", slots: [{ mod: "NM", index: 1, beatmapId: 75 }], url: "u" }
          : null,
      ),
      getPool: vi.fn(async (id: string) =>
        id === "abcdef"
          ? {
              id,
              name: "Pool",
              tournament: "OWC",
              round: "QF",
              year: 2026,
              owner: { osuId: 2, username: "peppy" },
              slots: [{ mod: "HD", index: 1, beatmapId: 75 }],
              buckets: [],
              url: "u",
            }
          : null,
      ),
    },
    context: createChannelContext(),
    ...over,
  }) as unknown as Services;

describe("map and pp views", () => {
  it("renders with the file, without it, and for a missing map", async () => {
    const s = fakeServices();
    const card = await renderMap(s, 75, [{ acronym: "HD" }]);
    expect(card?.fields).toHaveLength(3);
    const noFile = await renderMap(s, 76, [{ acronym: "DT" }]);
    expect(noFile?.fields?.[0]?.value).toContain("7.77★");
    expect(await renderMap(s, 404, [])).toBeNull();
  });

  it("scores pp best effort", async () => {
    const s = fakeServices();
    expect(await tryScorePp(s, makeScore())).not.toBeNull();
    expect(await tryScorePp(s, makeScore({ beatmapId: 76 }))).toBeNull();
    const broken = fakeServices({ beatmaps: { get: async () => new Uint8Array([1, 2, 3]) } });
    expect(await tryScorePp(broken, makeScore())).toBeNull();
    expect(await tryMapPp(broken, 75, null, [])).toBeNull();
    expect(await tryMapPp(s, 76, null, [])).toBeNull();
  });
});

describe("tool views", () => {
  it("decodes pack keys", () => {
    const key = encodePackKey({ name: "Keyed", slots: [{ mod: "NM", index: 1, beatmapId: 75 }] });
    expect(findPackKey(key)).toMatchObject({ kind: "pack", name: "Keyed", subtitle: "Pack key" });
    expect(findPackKey("pk1.broken")).toBeNull();
  });

  it("checks content and survives a metadata failure", async () => {
    const s = fakeServices();
    const slots = [1, 2, 3].map((beatmapId, i) => ({ mod: "NM", index: i + 1, beatmapId }));
    const check = await renderPoolCheck(s, { kind: "pool", name: "P", slots, url: "u" });
    expect(check.description).toContain("**Not allowed**");
    expect(check.description).toContain("**Couldn't check**");
    const failing = fakeServices({
      osu: {
        getBeatmaps: async () => Promise.reject(new Error("x")),
      } as unknown as Services["osu"],
    });
    expect((await metaFor(failing, slots)).size).toBe(0);
  });
});

describe("link cards", () => {
  it("renders every kind, or nothing", async () => {
    const s = fakeServices();
    expect((await renderLink(s, { key: "map", beatmapId: 75 }))?.embeds).toHaveLength(1);
    expect(await renderLink(s, { key: "map", beatmapId: 404 })).toBeNull();
    expect((await renderLink(s, { key: "match", matchId: 1 }))?.components).toHaveLength(1);
    expect(await renderLink(s, { key: "match", matchId: 404 })).toBeNull();
    expect((await renderLink(s, { key: "pack", slug: "AbCdEfGhIj" }))?.embeds[0]?.title).toBe(
      "Pack",
    );
    expect(await renderLink(s, { key: "pack", slug: "missing123" })).toBeNull();
    const key = encodePackKey({ name: "Keyed", slots: [{ mod: "NM", index: 1, beatmapId: 75 }] });
    expect((await renderLink(s, { key: "packKey", packKey: key }))?.embeds[0]?.title).toBe("Keyed");
    expect(await renderLink(s, { key: "packKey", packKey: "pk1.x" })).toBeNull();
    expect(
      (await renderLink(s, { key: "pool", poolId: "abcdef" }))?.embeds[0]?.description,
    ).toContain("OWC · QF · 2026 · by peppy");
    expect(await renderLink(s, { key: "pool", poolId: "missing" })).toBeNull();
    expect((await renderLink(s, { key: "bb", templateId: "abcdef" }))?.embeds).toHaveLength(1);
  });

  it("remembers what each channel linked", () => {
    const s = { context: createChannelContext() };
    remember(s, "c", { key: "map", beatmapId: 1 });
    remember(s, "c", { key: "match", matchId: 2 });
    remember(s, "c", { key: "pack", slug: "s" });
    remember(s, "c", { key: "pool", poolId: "p" });
    remember(s, "c", { key: "bb", templateId: "t" });
    expect(s.context.get("c", "map")?.beatmapId).toBe(1);
    expect(s.context.get("c", "match")?.matchId).toBe(2);
    expect(s.context.get("c", "pack")?.slug).toBe("s");
    expect(s.context.get("c", "pool")?.poolId).toBe("p");
  });
});

describe("export", () => {
  it("exports public commands for the site", () => {
    const { commands, version } = exportCommands();
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(commands.map((c) => c.name)).not.toContain("eval");
    const pool = commands.find((c) => c.name === "pool");
    expect(pool?.subcommands.map((sub) => sub.name)).toEqual(["view", "check", "parse"]);
    const top = commands.find((c) => c.name === "top");
    expect(top?.options.find((o) => o.name === "mode")?.choices).toEqual([
      "osu!",
      "taiko",
      "catch",
      "mania",
    ]);
    expect(top?.options.find((o) => o.name === "discord")?.type).toBe("member");
  });
});
