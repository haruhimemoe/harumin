/**
 * @file src/commands/shared.ts
 * @desc What several commands share: the player and ruleset options, loading the player a
 *       command is about, map options with the channel's last map as fallback, replies for
 *       problems, page buttons, and card image replies with link buttons.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Sun Oct 11, 2026
 */

import type { Ruleset } from "@haruhimemoe/harumin-config";
import type { OsuUserProfile } from "@haruhimemoe/osu";
import {
  ActionRowBuilder,
  type APIEmbed,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  type MessageActionRowComponentBuilder,
  MessageFlags,
  type RepliableInteraction,
  type SlashCommandBuilder,
  type SlashCommandOptionsOnlyBuilder,
  type SlashCommandSubcommandBuilder,
} from "discord.js";
import { notice, problem } from "../embeds/common.ts";
import { scope, translate } from "../i18n.ts";
import { parseMapInput } from "../links/index.ts";
import type { Cards } from "../services/cards.ts";
import { pickRuleset, playerKey, resolvePlayer } from "../services/players.ts";
import type { Services } from "../types.ts";
import { RULESET_CHOICES } from "../utils/format.ts";
import { noticeParts } from "../views/notice.ts";

const t = scope("shared");

type Builder = SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandBuilder;

/**
 * @function addPlayerOptions
 * @param builder {T} a command or subcommand
 * @param withMode {boolean} add the `mode` option too
 * @returns {T} the builder with `name` and `discord` (and `mode`)
 */
export const addPlayerOptions = <T extends Builder>(builder: T, withMode = true): T => {
  builder
    .addStringOption((option) =>
      option
        .setName("name")
        .setDescription("osu! username, profile link or #id")
        .setMaxLength(64)
        .setAutocomplete(true),
    )
    .addUserOption((option) =>
      option.setName("discord").setDescription("A Discord member who linked their osu! account"),
    );
  if (withMode) addModeOption(builder);
  return builder;
};

/**
 * @function addModeOption
 * @param builder {T} a command or subcommand
 * @returns {T} the builder with `mode`
 */
export const addModeOption = <T extends Builder>(builder: T): T => {
  builder.addStringOption((option) =>
    option
      .setName("mode")
      .setDescription("Ruleset (default: the server's, then the player's own)")
      .addChoices(...RULESET_CHOICES),
  );
  return builder;
};

/**
 * @function addMapOption
 * @param builder {T} a command or subcommand
 * @param required {boolean} whether the map must be given
 * @returns {T} the builder with `map`
 */
export const addMapOption = <T extends Builder>(builder: T, required = false): T => {
  builder.addStringOption((option) =>
    option
      .setName("map")
      .setDescription(required ? t("beatmapLinkOrId") : t("beatmapLinkOrId2"))
      .setMaxLength(200)
      .setAutocomplete(true)
      .setRequired(required),
  );
  return builder;
};

/**
 * @function fail
 * @param interaction {RepliableInteraction} the interaction
 * @param text {string} what went wrong and what to do
 * @returns {Promise<null>} null, so callers can `return fail(...)`
 */
export const fail = async (interaction: RepliableInteraction, text: string): Promise<null> => {
  await tell(interaction, "error", text);
  return null;
};

let noticeCards: Cards | null = null;

/**
 * @function useNoticeCards
 * @param cards {Cards | null} the card drawer for errors and confirmations (index.ts sets it)
 * @returns {void}
 */
export const useNoticeCards = (cards: Cards | null): void => {
  noticeCards = cards;
};

/**
 * @function tell
 * @param interaction {RepliableInteraction} the interaction
 * @param tone {"error" | "ok" | "info"} what kind of notice
 * @param text {string} one or two short sentences, Discord markdown
 * @returns {Promise<void>} the notice as a card image, or as a text embed when the text holds a
 *          link or an unknown mention, or the card can't be had. Not answered yet, it defers
 *          (privately) first, since drawing can take longer than Discord's 3 seconds.
 */
export const tell = async (
  interaction: RepliableInteraction,
  tone: "error" | "ok" | "info",
  text: string,
): Promise<void> => {
  const parts = noticeCards
    ? noticeParts(text, {
        channel: (id) => {
          const channel = interaction.client.channels.cache.get(id);
          return channel && "name" in channel && channel.name ? channel.name : undefined;
        },
        user: (id) => interaction.client.users.cache.get(id)?.username,
      })
    : null;
  if (parts && !interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }
  const png = parts && noticeCards ? await noticeCards.draw("notice", { tone, parts }) : null;
  const payload = png
    ? { content: "", embeds: [], files: [{ attachment: png, name: `${tone}.png` }] }
    : { embeds: [tone === "error" ? problem(text) : notice(text)] };
  if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
  else await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
};

/** The /link nudge. */
export const linkHint = (s: Services, self: boolean, discordId: string): string =>
  self ? t("thisDiscordAccountIsn", { URL: s.env.HUB_URL }) : t("notLinked", { discordId });

/**
 * @function loadPlayer
 * @param interaction {ChatInputCommandInteraction} with `name`, `discord` and `mode` options
 * @param s {Services} the services
 * @returns {Promise<{ profile: OsuUserProfile; ruleset: Ruleset } | null>} the player in the
 *          ruleset to show, or null after replying with the problem
 */
export const loadPlayer = async (
  interaction: ChatInputCommandInteraction,
  s: Services,
): Promise<{ profile: OsuUserProfile; ruleset: Ruleset } | null> => {
  const settings = await s.settings.get(interaction.guildId);
  const resolution = await resolvePlayer(
    {
      name: interaction.options.getString("name"),
      discordId: interaction.options.getUser("discord")?.id,
      callerId: interaction.user.id,
    },
    s.linking,
  );
  if (!resolution.ok) {
    return fail(
      interaction,
      linkHint(s, resolution.reason === "self-unlinked", resolution.discordId),
    );
  }
  const asked = pickRuleset(interaction.options.getString("mode"), settings.defaultMode);
  const profile = await s.osu.getUserProfile(
    playerKey(resolution.player),
    asked ? { ruleset: asked } : {},
  );
  if (!profile) {
    const who =
      resolution.player.kind === "name"
        ? `**${resolution.player.name}**`
        : `#${resolution.player.osuId}`;
    return fail(interaction, translate("common.noPlayer", { who }));
  }
  s.lookups.note(interaction.user.id, profile.username);
  return { profile, ruleset: asked ?? profile.playmode ?? "osu" };
};

/**
 * @function mapFromOption
 * @param interaction {ChatInputCommandInteraction} with a `map` option
 * @param s {Services} for the channel's context
 * @returns {Promise<number | null>} the difficulty id, or null after replying with the problem
 */
export const mapFromOption = async (
  interaction: ChatInputCommandInteraction,
  s: Services,
): Promise<number | null> => {
  const input = interaction.options.getString("map");
  if (input) {
    const id = parseMapInput(input);
    if (id) return id;
    return fail(interaction, t("thatIsnTA"));
  }
  const remembered = s.context.get(interaction.channelId, "map");
  if (remembered) return remembered.beatmapId;
  return fail(interaction, t("whichMapPassMap"));
};

/**
 * @function pageButtons
 * @param prefix {string} custom id start: "<command>:<args...>"
 * @param page {number} 1-based current page
 * @param pages {number} page count
 * @returns {ActionRowBuilder<MessageActionRowComponentBuilder>[]} one row of ◀ ▶, or none for a
 *          single page
 */
export const pageButtons = (
  prefix: string,
  page: number,
  pages: number,
): ActionRowBuilder<MessageActionRowComponentBuilder>[] => {
  if (pages <= 1) return [];
  return [
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${prefix}:${page - 1}`)
        .setLabel("◀")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page <= 1),
      new ButtonBuilder()
        .setCustomId(`${prefix}:${page + 1}`)
        .setLabel("▶")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= pages),
    ),
  ];
};

/**
 * @function clampPage
 * @param page {number} asked page
 * @param pages {number} page count
 * @returns {number} within 1..pages
 */
export const clampPage = (page: number, pages: number): number =>
  Math.min(Math.max(1, Number.isFinite(page) ? Math.trunc(page) : 1), Math.max(1, pages));

/** A link button: what it says and where it goes. */
export type LinkButton = { label: string; url: string };

const isWebUrl = ({ url }: LinkButton): boolean => {
  try {
    return ["https:", "http:"].includes(new URL(url).protocol);
  } catch {
    return false;
  }
};

/**
 * @function linkButtons
 * @param links {readonly LinkButton[]} up to five
 * @returns {ActionRowBuilder<MessageActionRowComponentBuilder>[]} one row of link buttons (links
 *          that aren't web URLs are left out), or none
 */
export const linkButtons = (
  links: readonly LinkButton[],
): ActionRowBuilder<MessageActionRowComponentBuilder>[] =>
  links.filter(isWebUrl).length === 0
    ? []
    : [
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          links
            .filter(isWebUrl)
            .slice(0, 5)
            .map(({ label, url }) =>
              new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(label).setURL(url),
            ),
        ),
      ];

/** A reply with the card image and its buttons, or the text embed and the same buttons. */
export type CardMessage = {
  embeds: APIEmbed[];
  files: { attachment: Buffer; name: string }[];
  components: ActionRowBuilder<MessageActionRowComponentBuilder>[];
};

/**
 * @function imageOrEmbed
 * @param png {Buffer | null} the card image, or null when it couldn't be had
 * @param name {string} its file name, e.g. "pool.png"
 * @param embed {() => APIEmbed} the text embed to send instead
 * @param components {ActionRowBuilder<MessageActionRowComponentBuilder>[]} buttons under either
 * @returns {CardMessage} the image when there is one, else the embed
 */
export const imageOrEmbed = (
  png: Buffer | null,
  name: string,
  embed: () => APIEmbed,
  components: ActionRowBuilder<MessageActionRowComponentBuilder>[],
): CardMessage =>
  png
    ? { embeds: [], files: [{ attachment: png, name }], components }
    : { embeds: [embed()], files: [], components };

/**
 * @function cardReply
 * @param png {Buffer} the card image
 * @param name {string} its file name, e.g. "profile.png"
 * @param rows {ActionRowBuilder<MessageActionRowComponentBuilder>[]} buttons under it
 * @param more {readonly { attachment: Buffer; name: string }[]} more images after it
 * @returns {object} an edit that shows only the images and the buttons, replacing any earlier
 *          embed or image
 */
export const cardReply = (
  png: Buffer,
  name: string,
  rows: ActionRowBuilder<MessageActionRowComponentBuilder>[],
  more: readonly { attachment: Buffer; name: string }[] = [],
) => ({
  content: "",
  embeds: [],
  attachments: [],
  files: [{ attachment: png, name }, ...more],
  components: rows,
});
