/**
 * @file src/i18n.ts
 * @desc harumin's words in the asker's language: the "harumin-bot" catalogs of
 *       @haruhimemoe/messages, loaded once at import, and the locale of the interaction (or the
 *       server, for link cards) carried through each handler by withLocale. scope("render") gives
 *       a file its t(), which reads that locale when it's called, so builders deep in a reply
 *       need no extra argument. Outside withLocale everything is English. Discord's own locale
 *       codes map to the catalogs' (es-ES to es, zh-CN to zh-Hans), English filling any gap.
 * @author David @dvhsh (https://dvh.sh)
 * @created Sun Oct 11, 2026
 * @modified Sun Oct 11, 2026
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { DEFAULT_LOCALE, LOCALES, loadMessages } from "@haruhimemoe/messages";
import { createTranslator } from "use-intl/core";

/** Values an ICU message takes. */
export type Values = Record<string, string | number | Date>;
/** A file's translator: a key under its scope and the message's values. */
export type T = (key: string, values?: Values) => string;

const NAMESPACE = "harumin-bot";

/** Discord locales whose catalog has another name. */
const DISCORD_TO_CATALOG: Readonly<Record<string, string>> = {
  "zh-CN": "zh-Hans",
  "zh-TW": "zh-Hant",
  "es-ES": "es",
  "es-419": "es",
  "sv-SE": "sv",
  "en-US": "en",
  "en-GB": "en",
};

/**
 * @function catalogLocale
 * @param discord {string | null | undefined} a Discord locale, like "ja" or "pt-BR"
 * @returns {string} the catalog that serves it: the same code, a known alias, its language
 *          alone, else English
 */
export const catalogLocale = (discord: string | null | undefined): string => {
  if (!discord) return DEFAULT_LOCALE;
  const named = DISCORD_TO_CATALOG[discord] ?? discord;
  if (LOCALES.includes(named)) return named;
  const language = named.split("-")[0] ?? "";
  return LOCALES.includes(language) ? language : DEFAULT_LOCALE;
};

const translators = new Map(
  await Promise.all(
    LOCALES.map(async (locale) => {
      const messages = await loadMessages(locale, NAMESPACE);
      return [locale, createTranslator({ locale, messages, namespace: NAMESPACE })] as const;
    }),
  ),
);

const current = new AsyncLocalStorage<string>();

/**
 * @function withLocale
 * @param locale {string | null | undefined} the interaction's or server's Discord locale
 * @param run {() => R} the handler
 * @returns {R} what run returns; every t() inside speaks that locale
 */
export const withLocale = <R>(locale: string | null | undefined, run: () => R): R =>
  current.run(catalogLocale(locale), run);

/**
 * @function currentLocale
 * @returns {string} the catalog locale of the handler running now ("en" outside one)
 */
export const currentLocale = (): string => current.getStore() ?? DEFAULT_LOCALE;

/**
 * @function translate
 * @param key {string} a full key under "harumin-bot", like "render.queued"
 * @param values {Values} ICU values
 * @returns {string} the message in the current locale
 */
export const translate = (key: string, values?: Values): string => {
  const t = translators.get(currentLocale()) ?? translators.get(DEFAULT_LOCALE);
  return (t as unknown as T)(key, values);
};

/**
 * @function scope
 * @param prefix {string} a file's part of the catalog, like "render"
 * @returns {T} t(key, values) for keys under that prefix, read at call time
 */
export const scope =
  (prefix: string): T =>
  (key, values) =>
    translate(`${prefix}.${key}`, values);
