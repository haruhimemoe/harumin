/**
 * @file src/commands/pool.ts
 * @desc /pool view|check|parse. view: a pool's card from pools.haruhime.moe. check: every map
 *       against osu!'s content usage rules (a pool link, or a pack link or key). parse: opens a
 *       form to paste a pool ("NM1 129891" lines, links or ids) and reads it back as slots, with
 *       a pack key to open it on packs.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import {
  type BucketEntry,
  DEFAULT_BUCKETS,
  encodePackKey,
  extractPackKey,
  insertBeforeTb,
  POOL_LINE_HELP,
  parsePoolText,
} from "@haruhimemoe/pool";
import {
  ActionRowBuilder,
  type ChatInputCommandInteraction,
  MessageFlags,
  type ModalActionRowComponentBuilder,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { LINKS } from "../constants.ts";
import { parsedPoolEmbed } from "../embeds/tools.ts";
import { refFromUrl } from "../links/index.ts";
import type { Command, Services } from "../types.ts";
import {
  type FoundPool,
  findPack,
  findPackKey,
  findPool,
  renderPoolCard,
  renderPoolCheck,
} from "../views/tools.ts";
import { fail } from "./shared.ts";

const POOL_ID = /^[A-Za-z0-9_-]{6,40}$/;

/**
 * @function findAny
 * @param s {Services} services
 * @param input {string | null} a pool or pack link, pool id, or pack key
 * @param channelId {string} for the channel's last pool
 * @returns {Promise<FoundPool | null | "unreadable" | "none">} the pool, null when not found,
 *          "unreadable" for input that isn't one, "none" when nothing was given or remembered
 */
const findAny = async (
  s: Services,
  input: string | null,
  channelId: string,
): Promise<FoundPool | null | "unreadable" | "none"> => {
  if (!input) {
    const remembered = s.context.get(channelId, "pool");
    return remembered ? findPool(s, remembered.poolId) : "none";
  }
  const key = extractPackKey(input);
  if (key) return findPackKey(key);
  try {
    const ref = refFromUrl(new URL(input));
    if (ref?.key === "pool") return findPool(s, ref.poolId);
    if (ref?.key === "pack") return findPack(s, ref.slug);
  } catch {
    // Not a link: maybe a bare pool id.
  }
  return POOL_ID.test(input) ? findPool(s, input) : "unreadable";
};

const answer = async (
  interaction: ChatInputCommandInteraction,
  s: Services,
  render: (found: FoundPool) => Promise<import("discord.js").APIEmbed>,
) => {
  const input = interaction.options.getString("pool")?.trim() ?? null;
  await interaction.deferReply();
  const found = await findAny(s, input, interaction.channelId);
  if (found === "none")
    return void (await fail(interaction, "Which pool? Pass `pool`, or link one here first."));
  if (found === "unreadable")
    return void (await fail(interaction, "That isn't a pool link, id or pack key."));
  if (!found) return void (await fail(interaction, "No public pool there."));
  await interaction.editReply({ embeds: [await render(found)] });
};

export const pool: Command = {
  category: "haruhime",
  data: new SlashCommandBuilder()
    .setName("pool")
    .setDescription("Mappools from pools.haruhime.moe")
    .addSubcommand((sub) =>
      sub
        .setName("view")
        .setDescription("A pool's maps")
        .addStringOption((option) =>
          option
            .setName("pool")
            .setDescription("Pool link or id (default: the last one here)")
            .setMaxLength(4000),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("check")
        .setDescription("Check every map against osu!'s content usage rules")
        .addStringOption((option) =>
          option
            .setName("pool")
            .setDescription("Pool link, pack link or pack key")
            .setMaxLength(4000),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("parse").setDescription("Paste a pool and get it back as slots"),
    )
    .toJSON(),
  async execute(interaction, s) {
    const sub = interaction.options.getSubcommand();
    if (sub === "view") return answer(interaction, s, (found) => renderPoolCard(s, found));
    if (sub === "check") return answer(interaction, s, (found) => renderPoolCheck(s, found));
    await interaction.showModal(
      new ModalBuilder()
        .setCustomId("pool:parse")
        .setTitle("Paste a pool")
        .addComponents(
          new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("name")
              .setLabel("Name")
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setMaxLength(64),
          ),
          new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("text")
              .setLabel("Maps, one per line")
              .setPlaceholder("NM1 https://osu.ppy.sh/b/129891\nHD1 1872396")
              .setStyle(TextInputStyle.Paragraph)
              .setMaxLength(4000),
          ),
        ),
    );
  },
  async modal(interaction) {
    const name = interaction.fields.getTextInputValue("name").trim() || "Pasted pool";
    const { slots, newBuckets, errors } = parsePoolText(
      interaction.fields.getTextInputValue("text"),
      { slots: [] },
    );
    if (slots.length === 0) {
      await interaction.reply({
        content: `Nothing to read there.\n${POOL_LINE_HELP}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const buckets = newBuckets.reduce<BucketEntry[]>(
      (list, bucket) => insertBeforeTb(list, bucket),
      [...DEFAULT_BUCKETS],
    );
    let url: string | null = null;
    try {
      url = `${LINKS.packs}/k#${encodePackKey({ name, slots, ...(newBuckets.length ? { buckets } : {}) })}`;
    } catch {
      url = null;
    }
    await interaction.reply({ embeds: [parsedPoolEmbed(slots, errors, url)] });
  },
};
