/**
 * @file src/commands/render.ts
 * @desc /render: a replay (.osr) rendered to video by o!rdr. The replay waits in harumin's line
 *       (one start per 5 minutes until there's an o!rdr key) and the reply is edited as it moves:
 *       its place, o!rdr's progress, then the video link. Edits go through the message, not the
 *       interaction, so a wait past Discord's 15 minute interaction window still lands.
 * @author David @dvhsh (https://dvh.sh)
 * @created Sat Oct 10, 2026
 * @modified Sat Oct 10, 2026
 */

import { type APIEmbed, MessageFlags, SlashCommandBuilder } from "discord.js";
import { COLORS } from "../constants.ts";
import type { RenderState } from "../services/renders.ts";
import type { Command } from "../types.ts";
import { fail } from "./shared.ts";

/** Biggest .osr taken. Replays of long maps run a few MB; o!rdr refuses huge ones anyway. */
const MAX_REPLAY_BYTES = 10 * 1024 * 1024;

/**
 * @function minutes
 * @param ms {number} a wait
 * @returns {string} "now", "about 1 minute", "about 7 minutes"
 */
const minutes = (ms: number): string => {
  const count = Math.ceil(ms / 60_000);
  if (count <= 0) return "now";
  return `in about ${count} minute${count === 1 ? "" : "s"}`;
};

/**
 * @function renderEmbed
 * @param state {RenderState} where the render is
 * @param filename {string} the replay's file name
 * @returns {APIEmbed} the reply for that state
 */
export const renderEmbed = (state: RenderState, filename: string): APIEmbed => {
  switch (state.kind) {
    case "queued":
      return {
        color: COLORS.warn,
        title: "Replay in line",
        description: `\`${filename}\` is #${state.position} in line and starts ${minutes(state.startsInMs)}.`,
      };
    case "rendering":
      return {
        color: COLORS.pink,
        title: "Rendering",
        description: `\`${filename}\`: ${state.progress}`,
      };
    case "done":
      return {
        color: COLORS.ok,
        title: "Render done",
        description: `\`${filename}\`: ${state.videoUrl}`,
      };
    case "failed":
      return {
        color: COLORS.bad,
        title: "Render failed",
        description: `\`${filename}\`: ${state.message}`,
      };
  }
};

export const render: Command = {
  category: "osu",
  data: new SlashCommandBuilder()
    .setName("render")
    .setDescription("Render a replay (.osr) to video with o!rdr")
    .addAttachmentOption((option) =>
      option.setName("replay").setDescription("The .osr file").setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("skin")
        .setDescription("An o!rdr skin name (default: the osu! default skin)")
        .setMaxLength(64),
    )
    .toJSON(),
  async execute(interaction, s) {
    const replay = interaction.options.getAttachment("replay", true);
    if (!replay.name.toLowerCase().endsWith(".osr")) {
      await fail(interaction, "That isn't a replay. Attach the `.osr` file osu! saves.");
      return;
    }
    if (replay.size > MAX_REPLAY_BYTES) {
      await fail(interaction, "That replay is over 10 MB, which is more than o!rdr takes.");
      return;
    }
    const filename = replay.name.slice(0, 80);
    const skin = interaction.options.getString("skin")?.trim() || "default";
    // Reply first so there's a message to edit; the first queued update fills it in.
    const reply = await interaction.reply({
      embeds: [{ color: COLORS.warn, description: "Getting in line..." }],
      withResponse: true,
    });
    const message = reply.resource?.message;
    let last = "";
    const taken = s.renders.enqueue({
      userId: interaction.user.id,
      replayUrl: replay.url,
      skin,
      onUpdate: (state) => {
        const embed = renderEmbed(state, filename);
        const key = JSON.stringify(embed);
        if (key === last) return;
        last = key;
        const edit = message
          ? message.edit({ embeds: [embed] })
          : interaction.editReply({ embeds: [embed] });
        edit.catch(() => undefined);
      },
    });
    if (!taken.ok) {
      await interaction.deleteReply().catch(() => undefined);
      await interaction.followUp({
        embeds: [
          {
            color: COLORS.bad,
            description:
              taken.reason === "already"
                ? "You already have a replay in line. Wait for it to start."
                : "The render line is full. Try again in a few minutes.",
          },
        ],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
