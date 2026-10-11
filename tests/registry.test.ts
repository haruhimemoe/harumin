/**
 * @file tests/registry.test.ts
 * @desc Where commands install: every public command on servers and users (any DM), except the
 *       server-only ones, which stay server installs in servers.
 * @author David @dvhsh (https://dvh.sh)
 * @created Sun Oct 11, 2026
 * @modified Sun Oct 11, 2026
 */

import { describe, expect, it } from "vitest";
import { publicCommands } from "../src/registry.ts";

describe("command installs", () => {
  it("lets users install everything but the server-only commands", () => {
    const byName = new Map(publicCommands().map((command) => [command.data.name, command.data]));
    expect(byName.get("recent")).toMatchObject({ integration_types: [0, 1], contexts: [0, 1, 2] });
    expect(byName.get("render")).toMatchObject({ integration_types: [0, 1], contexts: [0, 1, 2] });
    expect(byName.get("track")).toMatchObject({ integration_types: [0], contexts: [0] });
    expect(byName.get("server")).toMatchObject({ integration_types: [0], contexts: [0] });
    expect(byName.has("eval")).toBe(false);
  });
});
