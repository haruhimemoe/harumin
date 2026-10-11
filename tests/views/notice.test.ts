/**
 * @file tests/views/notice.test.ts
 * @desc A notice's markdown as card runs: bold and code, mentions by name, and the texts that stay
 *       an embed (links, unknown mentions, too long).
 * @author David @dvhsh (https://dvh.sh)
 * @created Sat Oct 10, 2026
 * @modified Sat Oct 10, 2026
 */

import { describe, expect, it } from "vitest";
import { noticeParts } from "../../src/views/notice.ts";

const CHANNEL = "123456789012345678";
const USER = "876543210987654321";
const names = {
  channel: (id: string) => (id === CHANNEL ? "scores" : undefined),
  user: (id: string) => (id === USER ? "david" : undefined),
};

describe("noticeParts", () => {
  it("keeps bold and code, and names mentions", () => {
    expect(noticeParts(`Tracking **peppy** in <#${CHANNEL}>. Use \`name\`.`, names)).toEqual([
      { text: "Tracking ", style: "plain" },
      { text: "peppy", style: "bold" },
      { text: " in ", style: "plain" },
      { text: "#scores", style: "bold" },
      { text: ". Use ", style: "plain" },
      { text: "name", style: "code" },
      { text: ".", style: "plain" },
    ]);
    expect(noticeParts(`<@!${USER}> hasn't linked.`, names)?.[0]).toEqual({
      text: "@david",
      style: "bold",
    });
  });

  it("leaves links, unknown mentions and long text to the embed", () => {
    expect(noticeParts("Link on https://haruhime.moe/account.", names)).toBeNull();
    expect(noticeParts("See the [dashboard](x).", names)).toBeNull();
    expect(noticeParts(`<#${USER}> is gone.`, names)).toBeNull();
    expect(noticeParts("x".repeat(601), names)).toBeNull();
    expect(noticeParts("", names)).toBeNull();
  });
});
