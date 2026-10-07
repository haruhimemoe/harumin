/**
 * @file src/commands/eval.ts
 * @desc /eval: run JavaScript inside the bot, for its owner. This is remote code execution on the
 *       host, so three checks hold together: it registers only in DEV_GUILD_ID (never globally),
 *       it runs only when the caller is OWNER_ID and the interaction is in DEV_GUILD_ID, and the
 *       answer is ephemeral with every env value redacted. Without `code` it opens a modal for
 *       multi-line input. The code sees `client`, `s` (the services) and `interaction`.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { inspect } from "node:util";
import {
  ActionRowBuilder,
  type Interaction,
  MessageFlags,
  type ModalActionRowComponentBuilder,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import type { Command, Services } from "../types.ts";
import { redact } from "../utils/redact.ts";

const AsyncFunction = Object.getPrototypeOf(async () => undefined).constructor as new (
  ...args: string[]
) => (...values: unknown[]) => Promise<unknown>;

const allowed = (interaction: Interaction, s: Services): boolean =>
  interaction.user.id === s.env.OWNER_ID && interaction.guildId === s.env.DEV_GUILD_ID;

/**
 * @function runEval
 * @param code {string} the source
 * @param scope {{ client: unknown; s: Services; interaction: unknown }} what the code sees
 * @returns {Promise<string>} the result or error, inspected, redacted, at most 1,900 characters
 */
export const runEval = async (
  code: string,
  scope: { client: unknown; s: Services; interaction: unknown },
): Promise<string> => {
  const started = performance.now();
  let output: string;
  try {
    const body = /\breturn\b|;|\n/.test(code) ? code : `return (${code});`;
    const result = await new AsyncFunction("client", "s", "interaction", body)(
      scope.client,
      scope.s,
      scope.interaction,
    );
    output =
      typeof result === "string" ? result : inspect(result, { depth: 1, maxArrayLength: 20 });
  } catch (error) {
    output = error instanceof Error ? `${error.name}: ${error.message}` : inspect(error);
  }
  const took = `${(performance.now() - started).toFixed(1)}ms`;
  const safe = redact(output, Object.values(scope.s.env));
  const clipped = safe.length > 1_850 ? `${safe.slice(0, 1_850)}\n…` : safe;
  return `\`\`\`js\n${clipped.replaceAll("```", "`​``")}\n\`\`\`-# ${took}`;
};

export const evalCommand: Command = {
  category: "bot",
  devOnly: true,
  data: new SlashCommandBuilder()
    .setName("eval")
    .setDescription("Owner only: run code in the bot")
    .addStringOption((option) =>
      option
        .setName("code")
        .setDescription("JavaScript (empty: open an editor)")
        .setMaxLength(4000),
    )
    .setDefaultMemberPermissions(0n)
    .toJSON(),
  async execute(interaction, s) {
    if (!allowed(interaction, s)) {
      await interaction.reply({ content: "No.", flags: MessageFlags.Ephemeral });
      return;
    }
    const code = interaction.options.getString("code");
    if (!code) {
      await interaction.showModal(
        new ModalBuilder()
          .setCustomId("eval:run")
          .setTitle("eval")
          .addComponents(
            new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId("code")
                .setLabel("Code")
                .setStyle(TextInputStyle.Paragraph)
                .setMaxLength(4000),
            ),
          ),
      );
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.editReply(
      await runEval(code, { client: interaction.client, s, interaction }),
    );
  },
  async modal(interaction, s) {
    if (!allowed(interaction, s)) {
      await interaction.reply({ content: "No.", flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const code = interaction.fields.getTextInputValue("code");
    await interaction.editReply(
      await runEval(code, { client: interaction.client, s, interaction }),
    );
  },
};
