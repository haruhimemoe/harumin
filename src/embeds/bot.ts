/**
 * @file src/embeds/bot.ts
 * @desc Cards about harumin itself: /help (generated from the registered commands), /info and
 *       /link.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { userUrl } from "@haruhimemoe/osu/shapes";
import {
  type APIApplicationCommandOption,
  type APIEmbed,
  ApplicationCommandOptionType,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord.js";
import { LINKS, VERSION } from "../constants.ts";
import type { LinkedAccount } from "../services/linking.ts";
import type { Category } from "../types.ts";
import { formatInt, truncate } from "../utils/format.ts";
import { card } from "./common.ts";

/** A command as /help and the site see it. */
export type CommandInfo = {
  data: RESTPostAPIChatInputApplicationCommandsJSONBody;
  category: Category;
};

/** Category headings, in /help order. */
export const CATEGORY_NAMES: Readonly<Record<Category, string>> = Object.freeze({
  osu: "osu!",
  haruhime: "haruhime tools",
  bot: "harumin",
});

const isSub = (option: APIApplicationCommandOption) =>
  option.type === ApplicationCommandOptionType.Subcommand ||
  option.type === ApplicationCommandOptionType.SubcommandGroup;

/**
 * @function usage
 * @param name {string} the command (with a subcommand, "pool view")
 * @param options {readonly APIApplicationCommandOption[]} its options
 * @returns {string} "/top [name] [mode] [sort]", required options in <>
 */
export const usage = (name: string, options: readonly APIApplicationCommandOption[] = []): string =>
  [
    `/${name}`,
    ...options
      .filter((option) => !isSub(option))
      .map((option) =>
        "required" in option && option.required ? `<${option.name}>` : `[${option.name}]`,
      ),
  ].join(" ");

/**
 * @function helpEmbed
 * @param commands {readonly CommandInfo[]} the public commands
 * @returns {APIEmbed} every command by category, one line each
 */
export const helpEmbed = (commands: readonly CommandInfo[]): APIEmbed => {
  const fields = (Object.keys(CATEGORY_NAMES) as Category[])
    .map((category) => ({
      name: CATEGORY_NAMES[category],
      value: commands
        .filter((command) => command.category === category)
        .map(({ data }) => `\`/${data.name}\` ${data.description}`)
        .join("\n"),
    }))
    .filter((field) => field.value !== "");
  return card({
    title: "harumin",
    url: LINKS.commands,
    description: `osu! in Discord. Pick a command for details: \`/help command:top\`.\nPlayer options default to your linked account (\`/link\`).`,
    fields,
  });
};

/**
 * @function commandHelpEmbed
 * @param command {CommandInfo} one command
 * @returns {APIEmbed} its usage and each option (subcommands listed with theirs)
 */
export const commandHelpEmbed = ({ data }: CommandInfo): APIEmbed => {
  const options = data.options ?? [];
  const subs = options.filter(isSub);
  const lines =
    subs.length > 0
      ? subs.map(
          (sub) =>
            `\`${usage(`${data.name} ${sub.name}`, "options" in sub ? (sub.options as APIApplicationCommandOption[]) : [])}\`\n${sub.description}`,
        )
      : [
          `\`${usage(data.name, options)}\``,
          ...options.map((option) => `**${option.name}** ${option.description}`),
        ];
  return card({
    title: `/${data.name}`,
    url: `${LINKS.commands}#${data.name}`,
    description: truncate([data.description, "", ...lines].join("\n"), 4096),
  });
};

/**
 * @function infoEmbed
 * @param stats {{ guilds: number; uptimeMs: number; pingMs: number }} live numbers
 * @returns {APIEmbed} version, numbers and links
 */
export const infoEmbed = ({
  guilds,
  uptimeMs,
  pingMs,
}: {
  guilds: number;
  uptimeMs: number;
  pingMs: number;
}): APIEmbed => {
  const hours = Math.floor(uptimeMs / 3_600_000);
  const minutes = Math.floor((uptimeMs % 3_600_000) / 60_000);
  return card({
    title: `harumin ${VERSION}`,
    url: LINKS.site,
    description: [
      "An osu! bot from haruhime.moe, for players, mappers and tournament hosts.",
      "",
      `**${formatInt(guilds)}** servers · up ${hours}h ${minutes}m · ${Math.round(pingMs)}ms`,
      "",
      `[Website](${LINKS.site}) · [Commands](${LINKS.commands}) · [Dashboard](${LINKS.dashboard}) · [Support](${LINKS.support}) · [Source](${LINKS.source})`,
    ].join("\n"),
  });
};

/**
 * @function linkEmbed
 * @param account {LinkedAccount | null} the caller's link
 * @param hubUrl {string} the accounts hub
 * @returns {APIEmbed} the link status and where to change it
 */
export const linkEmbed = (account: LinkedAccount | null, hubUrl: string): APIEmbed =>
  card({
    title: account ? "Linked" : "Link your osu! account",
    url: `${hubUrl}/account`,
    description: account
      ? `You're linked to **[${account.username}](${userUrl(account.osuId)})**. Commands use it when you leave the player empty.\nTo change or remove it, open your account on [haruhime.moe](${hubUrl}/account).`
      : `Sign in on [haruhime.moe](${hubUrl}/account) with osu!, then link Discord there. It takes a minute, and works for every haruhime tool.\nAfter that, \`/osu\`, \`/recent\` and the rest know who you are.`,
  });
