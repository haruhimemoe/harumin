/**
 * @file vitest.config.ts
 * @desc Vitest: every test under tests/, v8 coverage over the pure parts of src/ (embeds, links,
 *       services, utils). Discord wiring (commands, listeners, index) is checked by typecheck and
 *       by hand in the dev guild.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: [
        "src/embeds/**/*.ts",
        "src/links/**/*.ts",
        "src/services/**/*.ts",
        "src/utils/**/*.ts",
        "src/service/handler.ts",
      ],
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});
