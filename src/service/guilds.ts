/**
 * @file src/service/guilds.ts
 * @desc The bot's answers for the dashboard: which guilds a Discord user can manage (owner, or
 *       Manage Server through their roles) and which text channels harumin can post in. Candidate
 *       guilds are the ones the user was seen in, or every guild while harumin is in 200 or fewer;
 *       each candidate is confirmed with a member lookup (REST, no privileged intent).
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import type { ManageableGuild } from "@haruhimemoe/harumin-config";
import { ChannelType, type Client, type Guild, PermissionFlagsBits } from "discord.js";
import type { Members } from "../services/members.ts";
import { mapLimit } from "../utils/async.ts";

const SCAN_ALL_UNDER = 200;

const canManage = async (guild: Guild, discordId: string): Promise<boolean> => {
  if (guild.ownerId === discordId) return true;
  try {
    const member = await guild.members.fetch({ user: discordId, cache: true });
    return member.permissions.has(PermissionFlagsBits.ManageGuild);
  } catch {
    return false;
  }
};

/**
 * @function manageableGuilds
 * @param client {Client} the logged-in client
 * @param members {Pick<Members, "guildsOf">} sightings
 * @param discordId {string} the dashboard user
 * @returns {Promise<ManageableGuild[]>} guilds harumin is in where they have Manage Server, by name
 */
export const manageableGuilds = async (
  client: Client,
  members: Pick<Members, "guildsOf">,
  discordId: string,
): Promise<ManageableGuild[]> => {
  const all = client.guilds.cache;
  const ids = all.size <= SCAN_ALL_UNDER ? [...all.keys()] : await members.guildsOf(discordId);
  const guilds = ids
    .map((id) => all.get(id))
    .filter((guild): guild is Guild => guild !== undefined);
  const checked = await mapLimit(guilds, 5, async (guild) =>
    (await canManage(guild, discordId)) ? guild : null,
  );
  return checked
    .filter((guild): guild is Guild => guild !== null)
    .map((guild) => ({ id: guild.id, name: guild.name, icon: guild.icon }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * @function guildChannels
 * @param client {Client} the logged-in client
 * @param guildId {string} a guild
 * @returns {{ id: string; name: string }[] | null} text and announcement channels harumin can
 *          see and post in, by position; null when harumin isn't in the guild
 */
export const guildChannels = (
  client: Client,
  guildId: string,
): { id: string; name: string }[] | null => {
  const guild = client.guilds.cache.get(guildId);
  const me = guild?.members.me;
  if (!guild || !me) return null;
  return guild.channels.cache
    .filter(
      (channel) =>
        (channel.type === ChannelType.GuildText ||
          channel.type === ChannelType.GuildAnnouncement) &&
        channel
          .permissionsFor(me)
          .has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]),
    )
    .sort((a, b) => ("position" in a && "position" in b ? a.position - b.position : 0))
    .map((channel) => ({ id: channel.id, name: channel.name }));
};
