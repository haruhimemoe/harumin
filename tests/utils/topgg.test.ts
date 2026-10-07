/**
 * @file tests/utils/topgg.test.ts
 * @desc top.gg posting: off without a token, posts the count with one, logs failures.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { afterEach, expect, it, vi } from "vitest";
import { startTopgg } from "../../src/utils/topgg.ts";

afterEach(() => vi.unstubAllGlobals());

it("does nothing without a token, posts with one, and logs failures", async () => {
  const fetch = vi.fn(async () => new Response(null, { status: 401 }));
  vi.stubGlobal("fetch", fetch);
  const log = vi.fn();
  startTopgg({ token: undefined, botId: "1", guildCount: () => 5, log })();
  expect(fetch).not.toHaveBeenCalled();
  const stop = startTopgg({ token: "tok", botId: "1", guildCount: () => 5, log });
  await vi.waitFor(() => expect(log).toHaveBeenCalledWith("top.gg answered 401"));
  expect(fetch).toHaveBeenCalledWith(
    "https://top.gg/api/bots/1/stats",
    expect.objectContaining({ body: JSON.stringify({ server_count: 5 }) }),
  );
  fetch.mockRejectedValueOnce(new Error("down"));
  const stop2 = startTopgg({ token: "tok", botId: "1", guildCount: () => 5, log });
  await vi.waitFor(() => expect(log).toHaveBeenCalledWith("top.gg post failed", expect.any(Error)));
  stop();
  stop2();
});
