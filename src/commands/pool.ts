/**
 * @file src/commands/pool.ts
 * @desc /pool view|check|parse|fromtop. view: a pool's card from pools.haruhime.moe. check: every map
 *       against osu!'s content usage rules (a pool link, or a pack link or key). parse: opens a
 *       form to paste a pool ("NM1 129891" lines, links or ids) and reads it back as slots, with
 *       a pack key to open it on packs. fromtop: a draft pool from the player's top 100
 *       (src/views/fromtop.ts), with a pack link and pools' /new#<key> to build it.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Thu Oct 8, 2026
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
import { bucketCounts, parsedPoolEmbed } from "../embeds/tools.ts";
import { refFromUrl } from "../links/index.ts";
import type { Command, Services } from "../types.ts";
import { draftFromTop, FROMTOP_SIZES, type FromtopSize, shortBuckets } from "../views/fromtop.ts";
import { toPoolCard } from "../views/toolCards.ts";
import {
  type FoundPool,
  findPack,
  findPackKey,
  findPool,
  metaFor,
  renderPoolCard,
  renderPoolCheck,
} from "../views/tools.ts";
import {
  addPlayerOptions,
  type CardMessage,
  fail,
  imageOrEmbed,
  linkButtons,
  loadPlayer,
} from "./shared.ts";

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
  render: (found: FoundPool) => Promise<CardMessage>,
) => {
  const input = interaction.options.getString("pool")?.trim() ?? null;
  await interaction.deferReply();
  const found = await findAny(s, input, interaction.channelId);
  if (found === "none")
    return void (await fail(interaction, "Which pool? Pass `pool`, or link one here first."));
  if (found === "unreadable")
    return void (await fail(interaction, "That isn't a pool link, id or pack key."));
  if (!found) return void (await fail(interaction, "No public pool there."));
  await interaction.editReply(await render(found));
};

/** pools reads a draft from /new#<key>; a link past this length is left off. */
const MAX_BUILD_URL = 512;

/**
 * @function buildOnPools
 * @param packUrl {string} a packs /k#<key> link
 * @returns {string} pools' /new#<key>, or the plain /new when that would be too long
 */
const buildOnPools = (packUrl: string): string => {
  const url = `${LINKS.pools}/new#${packUrl.split("#")[1] ?? ""}`;
  return url.length <= MAX_BUILD_URL ? url : `${LINKS.pools}/new`;
};

const SIZE_NAMES: Readonly<Record<FromtopSize, string>> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
};

/**
 * @function fromtop
 * @param interaction {ChatInputCommandInteraction} /pool fromtop
 * @param s {Services} services
 * @returns {Promise<void>} a draft pool card from the player's top 100, with pack and pools links
 */
const fromtop = async (interaction: ChatInputCommandInteraction, s: Services): Promise<void> => {
  await interaction.deferReply();
  const loaded = await loadPlayer(interaction, s);
  if (!loaded) return;
  const { profile, ruleset } = loaded;
  const raw = interaction.options.getString("size");
  const size: FromtopSize = (FROMTOP_SIZES as readonly string[]).includes(raw ?? "")
    ? (raw as FromtopSize)
    : "medium";
  const scores = await s.osu.getUserScores(profile.osuId, "best", { ruleset, limit: 100 });
  const draft = draftFromTop(
    scores.map((score) => ({
      beatmapId: score.beatmapId,
      mods: score.mods.map((mod) => mod.acronym),
      pp: score.pp ?? 0,
    })),
    size,
  );
  if (draft.length < 5)
    return void (await fail(interaction, "Not enough top plays to draft a pool."));
  const slots = draft.map(({ mod, index, beatmapId }) => ({ mod, index, beatmapId }));
  const name = `${profile.username}'s draft pool`;
  const short = shortBuckets(draft, size);
  const note = short.length
    ? short.map(({ mod, short: n }) => `${mod} short by ${n}`).join(" · ")
    : null;
  const packUrl = `${LINKS.packs}/k#${encodePackKey({ name, slots })}`;
  const png = await s.cards.draw(
    "pool",
    toPoolCard({
      source: "fromtop",
      name,
      subtitle: `${SIZE_NAMES[size]} · from your top 100`,
      slots,
      meta: await metaFor(s, slots),
      note,
    }),
  );
  await interaction.editReply(
    imageOrEmbed(
      png,
      "pool.png",
      () => parsedPoolEmbed(slots, [], packUrl),
      linkButtons([
        { label: "Open as a pack", url: packUrl },
        // pools is osu!standard only.
        ...(ruleset === "osu" ? [{ label: "Build it on pools", url: buildOnPools(packUrl) }] : []),
      ]),
    ),
  );
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
    .addSubcommand((sub) =>
      addPlayerOptions(
        sub
          .setName("fromtop")
          .setDescription("Draft a tournament pool from your top plays")
          .addStringOption((option) =>
            option
              .setName("size")
              .setDescription("Pool size (default medium)")
              .addChoices(
                { name: "small (14 maps)", value: "small" },
                { name: "medium (18 maps)", value: "medium" },
                { name: "large (22 maps)", value: "large" },
              ),
          ),
      ),
    )
    .toJSON(),
  async execute(interaction, s) {
    const sub = interaction.options.getSubcommand();
    if (sub === "view") return answer(interaction, s, (found) => renderPoolCard(s, found));
    if (sub === "check") return answer(interaction, s, (found) => renderPoolCheck(s, found));
    if (sub === "fromtop") return fromtop(interaction, s);
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
  async modal(interaction, s) {
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
    await interaction.deferReply();
    const png = await s.cards.draw(
      "pool",
      toPoolCard({
        source: "parsed",
        name,
        subtitle: bucketCounts(slots),
        slots,
        meta: await metaFor(s, slots),
        note: errors.length
          ? `${errors.length} line${errors.length === 1 ? "" : "s"} skipped · ${errors
              .slice(0, 3)
              .map((error) => `line ${error.line}: ${error.reason}`)
              .join(" · ")}`
          : null,
      }),
    );
    await interaction.editReply(
      imageOrEmbed(
        png,
        "pool.png",
        () => parsedPoolEmbed(slots, errors, url),
        linkButtons([
          ...(url ? [{ label: "Open as a pack", url }] : []),
          { label: "Build it on pools", url: url ? buildOnPools(url) : `${LINKS.pools}/new` },
        ]),
      ),
    );
  },
};
