/**
 * @file src/commands/autocomplete.ts
 * @desc Autocomplete for the `name` and `map` options. Only what's in memory: the server's
 *       linked members (as /server last listed them), names the caller looked up in the last
 *       day, and the channel's last 10 maps. No osu! or HTTP calls, so it answers well inside
 *       Discord's 3 s. What was typed always comes first, so a link or an id still works.
 * @author David @dvhsh (https://dvh.sh)
 * @created Thu Oct 8, 2026
 * @modified Thu Oct 8, 2026
 */

import type { AutocompleteInteraction } from "discord.js";
import type { RecentMap } from "../services/context.ts";
import type { ServerRow } from "../services/serverRows.ts";
import type { Services } from "../types.ts";

/** Discord's caps: 25 choices, 100 characters per name and value. */
const MAX_CHOICES = 25;
const MAX_CHOICE_LENGTH = 100;
/** The `name` option takes 64 characters at most. */
const MAX_NAME_LENGTH = 64;

/** One choice. */
export type Choice = { name: string; value: string };

/**
 * @function autocompleteChoices
 * @param input {{ focused; typed; members; recentNames; maps }} the option being typed, what's
 *        typed so far, and what's in memory
 * @returns {Choice[]} at most 25 choices, the typed value first when there is one
 */
export const autocompleteChoices = (input: {
  focused: "name" | "map";
  typed: string;
  members: readonly ServerRow[];
  recentNames: readonly string[];
  maps: readonly RecentMap[];
}): Choice[] => {
  const typed = input.typed
    .trim()
    .slice(0, input.focused === "name" ? MAX_NAME_LENGTH : MAX_CHOICE_LENGTH);
  const lower = typed.toLowerCase();
  const found: Choice[] = [];
  if (input.focused === "name") {
    const seen = new Set<string>();
    const add = (username: string, rank: number | null) => {
      const key = username.toLowerCase();
      if (seen.has(key) || !key.startsWith(lower)) return;
      seen.add(key);
      found.push({
        name: (rank ? `${username} · #${rank.toLocaleString("en-US")}` : username).slice(
          0,
          MAX_CHOICE_LENGTH,
        ),
        value: username.slice(0, MAX_NAME_LENGTH),
      });
    };
    for (const member of input.members) add(member.username, member.rank);
    for (const name of input.recentNames) add(name, null);
  } else {
    for (const map of input.maps) {
      if (lower && !map.label.toLowerCase().includes(lower)) continue;
      found.push({ name: map.label.slice(0, MAX_CHOICE_LENGTH), value: String(map.beatmapId) });
    }
  }
  const echo =
    typed && !found.some((choice) => choice.value.toLowerCase() === lower)
      ? [{ name: typed, value: typed }]
      : [];
  return [...echo, ...found].slice(0, MAX_CHOICES);
};

/**
 * @function handleAutocomplete
 * @param interaction {AutocompleteInteraction} the keystroke
 * @param s {Services} services
 * @returns {Promise<void>} answers with choices; an expired interaction is ignored
 */
export const handleAutocomplete = async (
  interaction: AutocompleteInteraction,
  s: Pick<Services, "context" | "lookups" | "serverRows">,
): Promise<void> => {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== "name" && focused.name !== "map") return;
  const choices = autocompleteChoices({
    focused: focused.name,
    typed: String(focused.value),
    members: interaction.guildId ? s.serverRows.get(interaction.guildId) : [],
    recentNames: s.lookups.recent(interaction.user.id),
    maps: s.context.recentMaps(interaction.channelId),
  });
  await interaction.respond(choices).catch(() => undefined);
};
