/**
 * @file src/listeners/links.ts
 * @desc The messageCreate listener: notes who was seen, remembers each channel's last map, match,
 *       pack and pool, and answers links with a card when the server has that card on (the
 *       dashboard's toggles). Bots, webhooks and DMs are ignored; one link gets one card per
 *       channel per minute; a channel where harumin can't post embeds gets nothing.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Thu Oct 8, 2026
 */

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
    if (refs.length === 0) return;
    for (const ref of refs) remember(s, message.channelId, ref);
    const me = message.guild.members.me;
    const perms = me ? message.channel.permissionsFor(me) : null;
    if (!perms?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) return;
    const settings = await s.settings.get(message.guildId);
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
