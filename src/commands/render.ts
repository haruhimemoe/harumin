/**
 * @file src/commands/render.ts
 * @desc /render: a replay rendered to video by o!rdr, from an .osr attachment or a score link
 *       (osu.ppy.sh/scores/<id>, or /scores/<ruleset>/<id> for a stable score), whose replay
 *       harumin downloads from osu! first. The replay waits in harumin's line
 *       (one start per 5 minutes until there's an o!rdr key) and the reply is edited as it moves:
 *       its place, o!rdr's progress, then the video link. Edits go through the message, not the
 *       interaction, so a wait past Discord's 15 minute interaction window still lands.
 * @author David @dvhsh (https://dvh.sh)
 * @created Sat Oct 10, 2026
 * @modified Sat Oct 10, 2026
 */

import { OsuApiError } from "@haruhimemoe/osu";
import { type APIEmbed, MessageFlags, SlashCommandBuilder } from "discord.js";
import { COLORS } from "../constants.ts";
import type { RenderJob, RenderState } from "../services/renders.ts";
import type { Command } from "../types.ts";
import { fail } from "./shared.ts";

/** Biggest .osr taken. Replays of long maps run a few MB; o!rdr refuses huge ones anyway. */
const MAX_REPLAY_BYTES = 10 * 1024 * 1024;

const SCORE_RULESETS = ["osu", "taiko", "fruits", "mania"] as const;
type ScoreRuleset = (typeof SCORE_RULESETS)[number];

/** A score to download: its id, with the ruleset when it's a stable score's legacy id. */
export type ScoreRef = { id: number; ruleset?: ScoreRuleset };

/**
 * @function parseScoreRef
 * @param text {string} a score link or a bare id
 * @returns {ScoreRef | null} the score, or null when it isn't one
 */
export const parseScoreRef = (text: string): ScoreRef | null => {
  const trimmed = text.trim();
  if (/^\d{1,19}$/.test(trimmed)) return { id: Number(trimmed) };
  const match =
    /^(?:https?:\/\/)?(?:osu|lazer)\.ppy\.sh\/scores\/(?:(osu|taiko|fruits|mania)\/)?(\d{1,19})\/?(?:[?#].*)?$/i.exec(
      trimmed,
    );
  if (!match) return null;
  const id = Number(match[2]);
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const ruleset = match[1]?.toLowerCase() as ScoreRuleset | undefined;
  return ruleset ? { id, ruleset } : { id };
};

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
    .setDescription("Render a replay to video with o!rdr, from a score link or an .osr")
    .addStringOption((option) =>
      option.setName("score").setDescription("An osu! score link (osu.ppy.sh/scores/...)"),
    )
    .addAttachmentOption((option) => option.setName("replay").setDescription("Or the .osr file"))
    .addStringOption((option) =>
      option
        .setName("skin")
        .setDescription("An o!rdr skin name (default: the osu! default skin)")
        .setMaxLength(64),
    )
    .toJSON(),
  async execute(interaction, s) {
    const replay = interaction.options.getAttachment("replay");
    const scoreText = interaction.options.getString("score");
    let source: RenderJob["source"];
    let filename: string;
    if (replay) {
      if (!replay.name.toLowerCase().endsWith(".osr")) {
        await fail(interaction, "That isn't a replay. Attach the `.osr` file osu! saves.");
        return;
      }
      if (replay.size > MAX_REPLAY_BYTES) {
        await fail(interaction, "That replay is over 10 MB, which is more than o!rdr takes.");
        return;
      }
      source = { replayUrl: replay.url };
      filename = replay.name.slice(0, 80);
    } else if (scoreText) {
      const ref = parseScoreRef(scoreText);
      if (!ref) {
        await fail(interaction, "That isn't a score link. Copy it from the score's page on osu!.");
        return;
      }
      await interaction.deferReply();
      let bytes: Uint8Array | null;
      try {
        bytes = await s.osu.getScoreReplay(ref.id, ref.ruleset ? { ruleset: ref.ruleset } : {});
      } catch (error) {
        await fail(
          interaction,
          error instanceof OsuApiError && error.code === "budget"
            ? "osu! is busy right now. Try again in a minute."
            : "osu! didn't hand over that replay. Download it from the score page and attach the `.osr` instead.",
        );
        return;
      }
      if (!bytes) {
        await fail(interaction, "osu! has no replay for that score. Only some scores keep one.");
        return;
      }
      filename = `score-${ref.ruleset ? `${ref.ruleset}-` : ""}${ref.id}.osr`;
      source = { replay: bytes, filename };
    } else {
      await fail(interaction, "Give a `score` link or attach a `replay` (.osr).");
      return;
    }
    const skin = interaction.options.getString("skin")?.trim() || "default";
    // Reply first so there's a message to edit; the first queued update fills it in.
    const first = { embeds: [{ color: COLORS.warn, description: "Getting in line..." }] };
    const message = interaction.deferred
      ? await interaction.editReply(first)
      : (await interaction.reply({ ...first, withResponse: true })).resource?.message;
    let last = "";
    const taken = s.renders.enqueue({
      userId: interaction.user.id,
      source,
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
