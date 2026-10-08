/**
 * @file src/commands/track.ts
 * @desc /track add|remove|list: post a player's new top plays to a channel. Needs Manage Server.
 *       At most MAX_TRACKED_PER_GUILD players per server; the dashboard shows the same list.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Thu Oct 8, 2026
 */

import { MAX_TRACKED_PER_GUILD, type Ruleset } from "@haruhimemoe/harumin-config";
import {
  ChannelType,
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { notice } from "../embeds/common.ts";
import { trackListEmbed } from "../embeds/social.ts";
import { parsePlayerInput, playerKey } from "../services/players.ts";
import type { Command } from "../types.ts";
import { RULESET_CHOICES, RULESET_NAMES } from "../utils/format.ts";
import { toTracksCard } from "../views/toolCards.ts";
import { fail, imageOrEmbed } from "./shared.ts";

export const track: Command = {
  category: "osu",
  data: new SlashCommandBuilder()
    .setName("track")
    .setDescription("Post a player's new top plays in a channel")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Start tracking a player")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("osu! username, profile link or #id")
            .setRequired(true)
            .setMaxLength(64),
        )
        .addStringOption((option) =>
          option
            .setName("mode")
            .setDescription("Ruleset (default osu!)")
            .addChoices(...RULESET_CHOICES),
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Where to post (default: here)")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Stop tracking a player")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("osu! username, profile link or #id")
            .setRequired(true)
            .setMaxLength(64),
        )
        .addStringOption((option) =>
          option
            .setName("mode")
            .setDescription("Ruleset (default osu!)")
            .addChoices(...RULESET_CHOICES),
        ),
    )
    .addSubcommand((sub) => sub.setName("list").setDescription("Who this server tracks"))
    .toJSON(),
  async execute(interaction, s) {
    if (
      !interaction.inGuild() ||
      !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
    ) {
      await fail(interaction, "You need Manage Server to change tracking.");
      return;
    }
    const sub = interaction.options.getSubcommand();
    if (sub === "list") {
      await interaction.deferReply();
      const entries = await s.tracks.list(interaction.guildId);
      const channels = interaction.guild?.channels.cache;
      const png = await s.cards.draw(
        "tracks",
        toTracksCard(entries, MAX_TRACKED_PER_GUILD, (id) => channels?.get(id)?.name),
      );
      await interaction.editReply(
        imageOrEmbed(png, "tracks.png", () => trackListEmbed(entries, MAX_TRACKED_PER_GUILD), []),
      );
      return;
    }
    const input = parsePlayerInput(interaction.options.getString("name", true));
    if (!input) {
      await fail(interaction, "That isn't an osu! username.");
      return;
    }
    const ruleset = (interaction.options.getString("mode") as Ruleset | null) ?? "osu";
    await interaction.deferReply();
    const profile = await s.osu.getUserProfile(playerKey(input), { ruleset });
    if (!profile) {
      await fail(interaction, "osu! doesn't know that player.");
      return;
    }
    if (sub === "remove") {
      const removed = await s.tracks.remove(interaction.guildId, profile.osuId, ruleset);
      await interaction.editReply({
        embeds: [
          notice(
            removed
              ? `Stopped tracking **${profile.username}** (${RULESET_NAMES[ruleset]}).`
              : `**${profile.username}** wasn't tracked in ${RULESET_NAMES[ruleset]}.`,
          ),
        ],
      });
      return;
    }
    const channel = interaction.options.getChannel("channel") ?? interaction.channel;
    if (!channel) {
      await fail(interaction, "Pick a channel.");
      return;
    }
    const result = await s.tracks.add({
      guildId: interaction.guildId,
      channelId: channel.id,
      osuId: profile.osuId,
      username: profile.username,
      mode: ruleset,
      addedBy: interaction.user.id,
      addedAt: new Date(),
    });
    const text =
      result === "full"
        ? `This server already tracks ${MAX_TRACKED_PER_GUILD} players. Remove one first.`
        : result === "exists"
          ? `**${profile.username}** is already tracked in <#${channel.id}>.`
          : `Tracking **${profile.username}** (${RULESET_NAMES[ruleset]}) in <#${channel.id}>. New top plays show up within a few minutes.`;
    await interaction.editReply({ embeds: [notice(text)] });
  },
};
