/**
 * @file src/listeners/links.ts
 * @desc The messageCreate listener: notes who was seen, remembers each channel's last map, match,
 *       pack and pool, and answers links with a card when the server has that card on (the
 *       dashboard's toggles), and .osr files with the replay's score card and a Render button.
 *       Bots, webhooks and DMs are ignored; one link gets one card per channel per minute; a
 *       channel where harumin can't post embeds gets nothing.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Thu Oct 8, 2026
 */

import { beatmapUrl } from "@haruhimemoe/osu/shapes";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Message,
  type MessageActionRowComponentBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { matchCostReply } from "../commands/matchcost.ts";
import { type CardMessage, imageOrEmbed, linkButtons } from "../commands/shared.ts";
import { EMBED_DEDUPE_MS, LINKS } from "../constants.ts";
import { bbPreviewEmbed, matchSummaryEmbed } from "../embeds/tools.ts";
import { findLinks, type LinkRef, refId, settingFor } from "../links/index.ts";
import { createTtlCache } from "../services/cache.ts";
import type { Services } from "../types.ts";
import { renderMap } from "../views/map.ts";
import { loadReplay, MAX_REPLAY_BYTES, replayCard, replayLine } from "../views/replay.ts";
import { findPack, findPackKey, findPool, renderPoolCard } from "../views/tools.ts";

/**
 * @function remember
 * @param s {Pick<Services, "context">} the channel memory
 * @param channelId {string} where
 * @param ref {LinkRef} what was linked
 * @returns {void} stores maps, matches, packs and pools (pack keys and bb links aren't remembered)
 */
export const remember = (s: Pick<Services, "context">, channelId: string, ref: LinkRef): void => {
  if (ref.key === "map") s.context.rememberMap(channelId, ref.beatmapId);
  else if (ref.key === "match") s.context.set(channelId, { key: "match", matchId: ref.matchId });
  else if (ref.key === "pack") s.context.set(channelId, { key: "pack", slug: ref.slug });
  else if (ref.key === "pool") s.context.set(channelId, { key: "pool", poolId: ref.poolId });
};

/**
 * @function renderLink
 * @param s {Services} services
 * @param ref {LinkRef} a link
 * @returns {Promise<Card | null>} its card, or null when there's nothing to show
 */
export const renderLink = async (s: Services, ref: LinkRef): Promise<CardMessage | null> => {
  switch (ref.key) {
    case "map": {
      return renderMap(s, ref.beatmapId, []);
    }
    case "match": {
      const found = await s.osu.getMatch(ref.matchId, { maxPages: 10 });
      if (!found) return null;
      const card = await matchCostReply(s, found, { formula: "bathbot", warmups: 0 });
      if (card.files.length) return card;
      return {
        embeds: [matchSummaryEmbed(found.match)],
        files: [],
        components: [
          new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`matchcost:run:${ref.matchId}`)
              .setLabel("Match costs")
              .setStyle(ButtonStyle.Secondary),
          ),
        ],
      };
    }
    case "pack": {
      const found = await findPack(s, ref.slug);
      return found ? renderPoolCard(s, found) : null;
    }
    case "packKey": {
      const found = findPackKey(ref.packKey);
      return found ? renderPoolCard(s, found) : null;
    }
    case "pool": {
      const found = await findPool(s, ref.poolId);
      return found ? renderPoolCard(s, found) : null;
    }
    case "bb": {
      const png = await s.cards.draw("bb", { templateId: ref.templateId, name: null });
      return imageOrEmbed(
        png,
        "bb.png",
        () => bbPreviewEmbed(ref.templateId),
        linkButtons([{ label: "Open on bb", url: `${LINKS.bb}/t/${ref.templateId}` }]),
      );
    }
  }
};

/**
 * @function renderReplay
 * @param s {Services} services
 * @param bytes {Uint8Array} a posted .osr
 * @param message {{ channelId: string; id: string }} where it was posted (for the Render button)
 * @returns {Promise<(CardMessage & { content; beatmapId }) | null>} its score card with a Render
 *          button and the map's id, or null when it isn't a replay of a map osu! knows
 */
export const renderReplay = async (
  s: Services,
  bytes: Uint8Array,
  message: { channelId: string; id: string },
): Promise<(CardMessage & { content: string; beatmapId: number }) | null> => {
  const loaded = await loadReplay(s, bytes);
  if (!loaded.ok) return null;
  const png = await replayCard(s, loaded.replay);
  const components = [
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`render:osr:${message.channelId}:${message.id}`)
        .setLabel("Render")
        .setStyle(ButtonStyle.Secondary),
    ),
    ...linkButtons([{ label: "Beatmap", url: beatmapUrl(loaded.replay.map.beatmapId) }]),
  ];
  return {
    content: png ? "" : replayLine(loaded.replay),
    embeds: [],
    files: png ? [{ attachment: png, name: "replay.png" }] : [],
    components,
    beatmapId: loaded.replay.map.beatmapId,
  };
};

/**
 * @function postedReplays
 * @param message {Message} a chat message
 * @returns {{ url: string }[]} its .osr attachments small enough to read (at most 3)
 */
const postedReplays = (message: Message) =>
  [...message.attachments.values()]
    .filter((a) => a.name.toLowerCase().endsWith(".osr") && a.size <= MAX_REPLAY_BYTES)
    .slice(0, 3);

/**
 * @function createLinkListener
 * @param s {Services} services
 * @param log {(message: string, error?: unknown) => void} where failures go
 * @returns {(message: Message) => Promise<void>} the messageCreate handler
 */
export const createLinkListener = (
  s: Services,
  log: (message: string, error?: unknown) => void,
) => {
  const recent = createTtlCache<string, true>(EMBED_DEDUPE_MS, 20_000);
  return async (message: Message): Promise<void> => {
    if (message.author.bot || message.webhookId || !message.inGuild()) return;
    s.members.seen(message.guildId, message.author.id);
    const refs = findLinks(message.content);
    const replays = postedReplays(message);
    if (refs.length === 0 && replays.length === 0) return;
    for (const ref of refs) remember(s, message.channelId, ref);
    const me = message.guild.members.me;
    const perms = me ? message.channel.permissionsFor(me) : null;
    if (!perms?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) return;
    const settings = await s.settings.get(message.guildId);
    if (settings.autoEmbeds.replay) {
      for (const file of replays) {
        try {
          const response = await fetch(file.url, { signal: AbortSignal.timeout(15_000) });
          if (!response.ok) continue;
          const card = await renderReplay(s, new Uint8Array(await response.arrayBuffer()), message);
          if (!card) continue;
          const { beatmapId, ...reply } = card;
          s.context.rememberMap(message.channelId, beatmapId);
          await message.reply({ ...reply, allowedMentions: { repliedUser: false, parse: [] } });
        } catch (error) {
          log("replay card failed", error);
        }
      }
    }
    for (const ref of refs) {
      if (!settings.autoEmbeds[settingFor(ref)]) continue;
      const key = `${message.channelId}:${refId(ref)}`;
      if (recent.get(key)) continue;
      recent.set(key, true);
      try {
        const card = await renderLink(s, ref);
        if (card)
          await message.reply({ ...card, allowedMentions: { repliedUser: false, parse: [] } });
      } catch (error) {
        log(`link card failed for ${refId(ref)}`, error);
      }
    }
  };
};
