/**
 * @file tests/i18n.test.ts
 * @desc harumin's languages: Discord locales map to catalogs, t() reads the locale of the
 *       handler it runs in (English outside one), the English command text in the catalog
 *       matches the registered definitions, and registration adds no localizations while
 *       English is the only catalog.
 * @author David @dvhsh (https://dvh.sh)
 * @created Sun Oct 11, 2026
 * @modified Sun Oct 11, 2026
 */

import { loadMessages } from "@haruhimemoe/messages";
import { describe, expect, it } from "vitest";
import { catalogLocale, currentLocale, scope, translate, withLocale } from "../src/i18n.ts";
import { commandMessages, localizeCommands } from "../src/i18n-commands.ts";
import { devCommands, publicCommands } from "../src/registry.ts";

describe("catalogLocale", () => {
  it("falls back to English for anything the catalogs don't carry", () => {
    expect(catalogLocale(undefined)).toBe("en");
    expect(catalogLocale("en-US")).toBe("en");
    expect(catalogLocale("en-GB")).toBe("en");
    expect(catalogLocale("ja")).toBe("en");
    expect(catalogLocale("xx-YY")).toBe("en");
  });
});

describe("withLocale and scope", () => {
  it("reads the locale at call time, English outside a handler", async () => {
    expect(currentLocale()).toBe("en");
    const seen = await withLocale("en-GB", async () => {
      await Promise.resolve();
      return currentLocale();
    });
    expect(seen).toBe("en");
    const t = scope("commands.help");
    expect(t("description")).toBe("What harumin can do");
    expect(translate("commands.help.description")).toBe("What harumin can do");
  });
});

describe("command text", () => {
  const registered = [...publicCommands(), ...devCommands()].map((command) => command.data);

  it("matches the catalog's English", async () => {
    const catalog = (await loadMessages("en", "harumin-bot"))["harumin-bot"] as {
      commands: unknown;
    };
    expect(catalog.commands).toEqual(commandMessages(registered));
  });

  it("adds no localizations while English is the only catalog", async () => {
    expect(await localizeCommands(registered)).toEqual(registered);
  });
});
