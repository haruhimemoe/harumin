/**
 * @file src/router.ts
 * @desc Sends each interaction to its command: slash commands by name, buttons and modals by the
 *       custom id's first part ("top:…" goes to /top). Notes who was seen where, and turns
 *       failures into a short reply (osu! busy, osu! down, or a logged bug).
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { OsuApiError } from "@haruhimemoe/osu";
import type { Interaction, RepliableInteraction } from "discord.js";
import { handleAutocomplete } from "./commands/autocomplete.ts";
import { fail } from "./commands/shared.ts";
import { findCommand } from "./registry.ts";
import type { Services } from "./types.ts";

/**
 * @function failureText
 * @param error {unknown} what was thrown
 * @returns {string} what to tell the user
 */
export const failureText = (error: unknown): string => {
  if (error instanceof OsuApiError) {
    if (error.code === "budget")
      return "harumin is busy talking to osu!. Try again in a few seconds.";
    if (error.status === 429) return "osu! is rate limiting harumin. Try again in a minute.";
    if (error.code === "timeout" || error.code === "network" || (error.status ?? 0) >= 500) {
      return "osu! isn't answering right now. Try again in a minute.";
    }
  }
  return "Something broke on harumin's side. It's been logged.";
};

const report = async (
  interaction: RepliableInteraction,
  error: unknown,
  log: (message: string, error: unknown) => void,
) => {
  if (!(error instanceof OsuApiError) || error.code !== "budget") log(`interaction failed`, error);
  try {
    await fail(interaction, failureText(error));
  } catch {
    // The interaction expired; nothing to answer.
  }
};

/**
 * @function createRouter
 * @param s {Services} the services
 * @param log {(message: string, error?: unknown) => void} where failures go
 * @returns {(interaction: Interaction) => Promise<void>} the interactionCreate handler
 */
export const createRouter =
  (s: Services, log: (message: string, error?: unknown) => void) =>
  async (interaction: Interaction): Promise<void> => {
    if (interaction.guildId) s.members.seen(interaction.guildId, interaction.user.id);
    if (interaction.isAutocomplete()) {
      await handleAutocomplete(interaction, s).catch((error) => log("autocomplete failed", error));
      return;
    }
    if (interaction.isChatInputCommand()) {
      const command = findCommand(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction, s);
      } catch (error) {
        await report(interaction, error, log);
      }
      return;
    }
    if (interaction.isButton() || interaction.isModalSubmit()) {
      const [name = "", ...args] = interaction.customId.split(":");
      const command = findCommand(name);
      const handler = interaction.isButton() ? command?.button : command?.modal;
      if (!command || !handler) return;
      try {
        // biome-ignore lint/suspicious/noExplicitAny: the guard above matched handler to interaction
        await (handler as (i: any, s: Services, a: string[]) => Promise<void>)(
          interaction,
          s,
          args,
        );
      } catch (error) {
        await report(interaction, error, log);
      }
    }
  };
