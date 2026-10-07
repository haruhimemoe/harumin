/**
 * @file src/export.ts
 * @desc The public commands as plain data for the site: name, description, category, and each
 *       option (or subcommand with its options) with type, whether it's required, and choices.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { type APIApplicationCommandOption, ApplicationCommandOptionType } from "discord.js";
import { VERSION } from "./constants.ts";
import { CATEGORY_NAMES } from "./embeds/bot.ts";
import { publicCommands } from "./registry.ts";
import type { Category } from "./types.ts";

/** One option as the site shows it. */
export type ExportedOption = {
  name: string;
  description: string;
  type: string;
  required: boolean;
  choices?: string[];
};

/** One command (or subcommand) as the site shows it. */
export type ExportedCommand = {
  name: string;
  description: string;
  category: Category;
  categoryName: string;
  options: ExportedOption[];
  subcommands: { name: string; description: string; options: ExportedOption[] }[];
};

const TYPE_NAMES: Partial<Record<ApplicationCommandOptionType, string>> = {
  [ApplicationCommandOptionType.String]: "text",
  [ApplicationCommandOptionType.Integer]: "whole number",
  [ApplicationCommandOptionType.Number]: "number",
  [ApplicationCommandOptionType.Boolean]: "yes/no",
  [ApplicationCommandOptionType.User]: "member",
  [ApplicationCommandOptionType.Channel]: "channel",
};

const toOption = (option: APIApplicationCommandOption): ExportedOption => ({
  name: option.name,
  description: option.description,
  type: TYPE_NAMES[option.type] ?? "value",
  required: "required" in option ? Boolean(option.required) : false,
  ...("choices" in option && option.choices
    ? { choices: option.choices.map((choice) => choice.name) }
    : {}),
});

/**
 * @function exportCommands
 * @returns {{ version: string; commands: ExportedCommand[] }} every public command
 */
export const exportCommands = (): { version: string; commands: ExportedCommand[] } => ({
  version: VERSION,
  commands: publicCommands().map(({ data, category }) => {
    const options = data.options ?? [];
    const subs = options.filter(
      (option) => option.type === ApplicationCommandOptionType.Subcommand,
    );
    return {
      name: data.name,
      description: data.description,
      category,
      categoryName: CATEGORY_NAMES[category],
      options: options
        .filter((option) => option.type !== ApplicationCommandOptionType.Subcommand)
        .map(toOption),
      subcommands: subs.map((sub) => ({
        name: sub.name,
        description: sub.description,
        options: ("options" in sub && sub.options ? sub.options : []).map(toOption),
      })),
    };
  }),
});
