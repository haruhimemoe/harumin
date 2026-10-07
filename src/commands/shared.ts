/**
 * @file src/commands/shared.ts
 * @desc What several commands share: the player and ruleset options, loading the player a
 *       command is about, map options with the channel's last map as fallback, replies for
 *       problems, page buttons, and card image replies with link buttons.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Wed Oct 7, 2026
 */

import type { Ruleset } from "@haruhimemoe/harumin-config";
import type { OsuUserProfile } from "@haruhimemoe/osu";
import {
  ActionRowBuilder,
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
import { problem } from "../embeds/common.ts";
import { parseMapInput } from "../links/index.ts";
import { pickRuleset, playerKey, resolvePlayer } from "../services/players.ts";
import type { Services } from "../types.ts";
import { RULESET_CHOICES } from "../utils/format.ts";

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
      option.setName("name").setDescription("osu! username, profile link or #id").setMaxLength(64),
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
      .setDescription(
        required
          ? "Beatmap link or id"
          : "Beatmap link or id (default: the last map in this channel)",
      )
      .setMaxLength(200)
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
  const payload = { embeds: [problem(text)] };
  if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
  else await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
  return null;
};

/** The /link nudge. */
export const linkHint = (s: Services, self: boolean, discordId: string): string =>
  self
    ? `This Discord account isn't linked to a haruhime.moe account yet, so I don't know your osu! name. Link Discord on ${s.env.HUB_URL}/account (**/link** has the button), or pass \`name\`.`
    : `<@${discordId}> hasn't linked Discord on haruhime.moe. Pass \`name\` instead.`;

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
    return fail(interaction, `osu! has no player ${who}.`);
  }
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
    return fail(
      interaction,
      "That isn't a beatmap link or id. Open the difficulty on osu! and copy its link (a set link without a difficulty won't do).",
    );
  }
  const remembered = s.context.get(interaction.channelId, "map");
  if (remembered) return remembered.beatmapId;
  return fail(interaction, "Which map? Pass `map`, or link one in this channel first.");
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

/**
 * @function linkButtons
 * @param links {readonly LinkButton[]} up to five
 * @returns {ActionRowBuilder<MessageActionRowComponentBuilder>[]} one row of link buttons, or none
 */
export const linkButtons = (
  links: readonly LinkButton[],
): ActionRowBuilder<MessageActionRowComponentBuilder>[] =>
  links.length === 0
    ? []
    : [
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          links
            .slice(0, 5)
            .map(({ label, url }) =>
              new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(label).setURL(url),
            ),
        ),
      ];

/**
 * @function cardReply
 * @param png {Buffer} the card image
 * @param name {string} its file name, e.g. "profile.png"
 * @param rows {ActionRowBuilder<MessageActionRowComponentBuilder>[]} buttons under it
 * @returns {object} an edit that shows only the image and the buttons, replacing any earlier
 *          embed or image
 */
export const cardReply = (
  png: Buffer,
  name: string,
  rows: ActionRowBuilder<MessageActionRowComponentBuilder>[],
) => ({
  content: "",
  embeds: [],
  attachments: [],
  files: [{ attachment: png, name }],
  components: rows,
});
