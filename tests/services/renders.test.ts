/**
 * @file tests/services/renders.test.ts
 * @desc The /render queue: one start per gap, positions, one job per person, a full line,
 *       retryable refusals keep their place, other refusals fail the job.
 * @author David @dvhsh (https://dvh.sh)
 * @created Sat Oct 10, 2026
 * @modified Sat Oct 10, 2026
 */

import { OrdrError } from "@haruhimemoe/ordr";
import { describe, expect, it, vi } from "vitest";
import { createRenders, type RenderState } from "../../src/services/renders.ts";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const setup = (createRender: () => Promise<{ renderId: number }>) => {
  let time = 0;
  const sleeps: number[] = [];
  const ordr = {
    createRender: vi.fn(createRender),
    waitForRender: vi.fn(async (renderId: number) => ({
      renderId,
      videoUrl: `https://link.issou.best/${renderId}`,
      render: {} as never,
    })),
  };
  const renders = createRenders(ordr as never, {
    gapMs: 1000,
    now: () => time,
    sleep: async (ms) => {
      sleeps.push(ms);
      time += ms;
    },
  });
  const job = (userId: string) => {
    const states: RenderState[] = [];
    return {
      states,
      job: {
        userId,
        replayUrl: `https://cdn/${userId}.osr`,
        skin: "default",
        onUpdate: (s: RenderState) => states.push(s),
      },
    };
  };
  return { renders, ordr, sleeps, job };
};

describe("render queue", () => {
  it("starts one render per gap and reports the video", async () => {
    let id = 0;
    const { renders, ordr, sleeps, job } = setup(async () => ({ renderId: ++id }));
    const a = job("a");
    const b = job("b");
    expect(renders.enqueue(a.job)).toEqual({ ok: true });
    expect(renders.enqueue(b.job)).toEqual({ ok: true });
    expect(b.states[0]).toEqual({ kind: "queued", position: 2, startsInMs: 1000 });
    for (let i = 0; i < 5; i++) await flush();
    expect(ordr.createRender).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([1000]);
    expect(a.states.at(-1)).toEqual({ kind: "done", videoUrl: "https://link.issou.best/1" });
    expect(b.states.at(-1)).toEqual({ kind: "done", videoUrl: "https://link.issou.best/2" });
    expect(b.states).toContainEqual({ kind: "queued", position: 1, startsInMs: 1000 });
    expect(renders.size()).toBe(0);
  });

  it("takes one job per person and at most ten", () => {
    const { renders, job } = setup(() => new Promise(() => undefined));
    expect(renders.enqueue(job("a").job).ok).toBe(true);
    expect(renders.enqueue(job("a").job)).toEqual({ ok: false, reason: "already" });
    for (let i = 1; i < 10; i++) renders.enqueue(job(`u${i}`).job);
    expect(renders.enqueue(job("late").job)).toEqual({ ok: false, reason: "full" });
  });

  it("keeps a job first after a retryable refusal, fails it otherwise", async () => {
    let calls = 0;
    const { renders, sleeps, job } = setup(async () => {
      calls++;
      if (calls === 1)
        throw new OrdrError("rejected", "busy", { retryable: true, retryAfterMs: 300 });
      if (calls === 2) return { renderId: 7 };
      throw new OrdrError("rejected", "bad replay");
    });
    const a = job("a");
    const b = job("b");
    renders.enqueue(a.job);
    renders.enqueue(b.job);
    for (let i = 0; i < 8; i++) await flush();
    expect(sleeps).toEqual([300, 1000]);
    expect(a.states.at(-1)).toEqual({ kind: "done", videoUrl: "https://link.issou.best/7" });
    expect(b.states.at(-1)).toEqual({ kind: "failed", message: "o!rdr said no: bad replay" });
  });
});

describe("render reply", () => {
  it("words each state", async () => {
    const { renderEmbed } = await import("../../src/commands/render.ts");
    expect(
      renderEmbed({ kind: "queued", position: 2, startsInMs: 61_000 }, "a.osr").description,
    ).toBe("`a.osr` is #2 in line and starts in about 2 minutes.");
    expect(
      renderEmbed({ kind: "queued", position: 1, startsInMs: 0 }, "a.osr").description,
    ).toContain("starts now");
    expect(renderEmbed({ kind: "done", videoUrl: "https://x" }, "a.osr").description).toBe(
      "`a.osr`: https://x",
    );
  });
});
