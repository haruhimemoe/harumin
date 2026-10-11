/**
 * @file src/i18n-commands.ts
 * @desc Slash command text in every language the catalogs carry. The English in each command's
 *       definition is the source; "harumin-bot.commands" mirrors it (commandMessages builds that
 *       tree, and a test keeps the two in step). localizeCommands adds Discord's
 *       description_localizations and choice name_localizations from every other catalog,
 *       only where a translation differs from English. Command and option names stay English:
 *       they're what people type.
 * @author David @dvhsh (https://dvh.sh)
 * @created Sun Oct 11, 2026
 * @modified Sun Oct 11, 2026
 */

import { LOCALES, loadMessages } from "@haruhimemoe/messages";

/** The slice of Discord's command JSON this file reads and writes. */
type Choice = { name: string; value: string | number; name_localizations?: Record<string, string> };
type Option = {
  name: string;
  description: string;
  description_localizations?: Record<string, string>;
  choices?: Choice[];
  options?: Option[];
};
/** A command's JSON (RESTPostAPIChatInputApplicationCommandsJSONBody, structurally). */
export type CommandJson = Option;

/** A catalog subtree: nested objects of strings. */
type Tree = { [key: string]: string | Tree };

/** Discord's locales, by the catalog locale that serves each. */
const DISCORD_LOCALES: Readonly<Record<string, readonly string[]>> = {
  bg: ["bg"],
  cs: ["cs"],
  da: ["da"],
  de: ["de"],
  el: ["el"],
  es: ["es-ES", "es-419"],
  fi: ["fi"],
  fr: ["fr"],
  hi: ["hi"],
  hr: ["hr"],
  hu: ["hu"],
  id: ["id"],
  it: ["it"],
  ja: ["ja"],
  ko: ["ko"],
  lt: ["lt"],
  nl: ["nl"],
  no: ["no"],
  pl: ["pl"],
  "pt-BR": ["pt-BR"],
  ro: ["ro"],
  ru: ["ru"],
  sv: ["sv-SE"],
  th: ["th"],
  tr: ["tr"],
  uk: ["uk"],
  vi: ["vi"],
  "zh-Hans": ["zh-CN"],
  "zh-Hant": ["zh-TW"],
};

/**
 * @function optionTree
 * @param option {Option} a command, subcommand or option
 * @returns {Tree} its description, its choices by value, and its options and subcommands by name
 */
const optionTree = (option: Option): Tree => {
  const tree: Tree = { description: option.description };
  if (option.choices?.length) {
    tree.choices = Object.fromEntries(option.choices.map((c) => [String(c.value), c.name]));
  }
  if (option.options?.length) {
    tree.options = Object.fromEntries(option.options.map((o) => [o.name, optionTree(o)]));
  }
  return tree;
};

/**
 * @function commandMessages
 * @param commands {readonly object[]} the registered commands' JSON
 * @returns {Tree} the English "commands" subtree of the harumin-bot catalog
 */
export const commandMessages = (commands: readonly object[]): Tree =>
  Object.fromEntries(
    (commands as readonly CommandJson[]).map((command) => [command.name, optionTree(command)]),
  );

const localize = (
  option: Option,
  english: Tree,
  translations: readonly [string, Tree][],
): Option => {
  const at = (tree: Tree | undefined, key: string): Tree | undefined => {
    const next = tree?.[key];
    return typeof next === "object" ? next : undefined;
  };
  const descriptions: Record<string, string> = {};
  for (const [locale, tree] of translations) {
    const text = tree.description;
    if (typeof text === "string" && text !== english.description) {
      for (const discord of DISCORD_LOCALES[locale] ?? []) descriptions[discord] = text;
    }
  }
  return {
    ...option,
    ...(Object.keys(descriptions).length ? { description_localizations: descriptions } : {}),
    ...(option.choices
      ? {
          choices: option.choices.map((choice) => {
            const names: Record<string, string> = {};
            for (const [locale, tree] of translations) {
              const text = at(tree, "choices")?.[String(choice.value)];
              if (typeof text === "string" && text !== choice.name) {
                for (const discord of DISCORD_LOCALES[locale] ?? []) names[discord] = text;
              }
            }
            return Object.keys(names).length ? { ...choice, name_localizations: names } : choice;
          }),
        }
      : {}),
    ...(option.options
      ? {
          options: option.options.map((child) =>
            localize(
              child,
              at(at(english, "options"), child.name) ?? { description: child.description },
              translations.map(([locale, tree]) => [
                locale,
                at(at(tree, "options"), child.name) ?? {},
              ]),
            ),
          ),
        }
      : {}),
  };
};

/**
 * @function localizeCommands
 * @param commands {readonly C[]} the commands to register
 * @returns {Promise<C[]>} the same commands with Discord's localizations from every catalog
 *          besides English (unchanged while English is the only one)
 */
export const localizeCommands = async <C extends object>(commands: readonly C[]): Promise<C[]> => {
  const others = LOCALES.filter((locale) => locale !== "en");
  if (others.length === 0) return [...commands];
  const trees = await Promise.all(
    others.map(async (locale) => {
      const messages = (await loadMessages(locale, "harumin-bot"))["harumin-bot"] as Tree;
      return [locale, (messages.commands as Tree | undefined) ?? {}] as const;
    }),
  );
  return commands.map((data) => {
    // Discord's own JSON type, read through the slice this file uses.
    const command = data as unknown as CommandJson;
    return localize(
      command,
      optionTree(command),
      trees.map(([locale, tree]) => [locale, (tree[command.name] as Tree | undefined) ?? {}]),
    ) as unknown as C;
  });
};
