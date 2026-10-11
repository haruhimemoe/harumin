/**
 * @file src/commands/render.ts
 * @desc /render: a replay rendered to video by o!rdr, from an .osr attachment or a score link
 *       (osu.ppy.sh/scores/<id>, or /scores/<ruleset>/<id> for a stable score), whose replay
 *       harumin downloads from osu! first. The reply is the replay's score card with one status
 *       line above it, edited as the replay moves through harumin's line (one start per 5
 *       minutes until there's an o!rdr key): its place, o!rdr's progress, then "done", with the
 *       video link posted alone in a reply so Discord shows the player.
 *       Edits go through the message, not the interaction, so a wait past Discord's 15 minute
 *       interaction window still lands. The Render button on an .osr card (render:osr:<channel>:
 *       <message>) starts the same thing from the posted file.
 * @author David @dvhsh (https://dvh.sh)
 * @created Sat Oct 10, 2026
 * @modified Sat Oct 10, 2026
 */

import { OsuApiError } from "@haruhimemoe/osu";
import {
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Message,
  SlashCommandBuilder,
} from "discord.js";
import type { RenderState } from "../services/renders.ts";
import type { Command, Services } from "../types.ts";
import {
  loadReplay,
  MAX_REPLAY_BYTES,
  REPLAY_PROBLEMS,
  replayCard,
  replayLine,
} from "../views/replay.ts";
import { fail } from "./shared.ts";

type ScoreRuleset = "osu" | "taiko" | "fruits" | "mania";

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
 * @returns {string} "now", "in about 1 minute", "in about 7 minutes"
 */
const minutes = (ms: number): string => {
  const count = Math.ceil(ms / 60_000);
  if (count <= 0) return "now";
  return `in about ${count} minute${count === 1 ? "" : "s"}`;
};

/**
 * @function renderStatus
 * @param state {RenderState} where the render is
 * @returns {string} the line above the card
 */
export const renderStatus = (state: RenderState): string => {
  switch (state.kind) {
    case "queued":
      return `Render #${state.position} in line, starts ${minutes(state.startsInMs)}.`;
    case "rendering":
      return `Rendering: ${state.progress}`;
    case "done":
      return "Render done. The video is in the reply below.";
    case "failed":
      return `Render failed. ${state.message}`;
  }
};

/**
 * @function fetchReplay
 * @param url {string} a Discord attachment URL
 * @returns {Promise<Uint8Array | null>} its bytes, or null when Discord didn't hand them over
 */
const fetchReplay = async (url: string): Promise<Uint8Array | null> => {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.length <= MAX_REPLAY_BYTES ? bytes : null;
  } catch {
    return null;
  }
};

/**
 * @function startRender
 * @param interaction {ChatInputCommandInteraction | ButtonInteraction} already deferred
 * @param s {Services} services
 * @param bytes {Uint8Array} the .osr
 * @param skin {string} the o!rdr skin
 * @returns {Promise<void>} shows the replay's card and puts it in the render line
 */
export const startRender = async (
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  s: Services,
  bytes: Uint8Array,
  skin: string,
): Promise<void> => {
  let loaded: Awaited<ReturnType<typeof loadReplay>>;
  try {
    loaded = await loadReplay(s, bytes);
  } catch {
    await fail(
      interaction,
      "osu! didn't answer, so I couldn't find the replay's map. Try again in a minute.",
    );
    return;
  }
  if (!loaded.ok) {
    await fail(interaction, REPLAY_PROBLEMS[loaded.problem]);
    return;
  }
  const { replay } = loaded;
  const png = await replayCard(s, replay);
  // Without a card the map line goes under the status, so the reply still says what it is.
  const below = png ? "" : `\n${replayLine(replay)}`;
  const message: Message = await interaction.editReply({
    content: `Getting in line...${below}`,
    embeds: [],
    files: png ? [{ attachment: png, name: "replay.png" }] : [],
  });
  // In a server the bot is in, the message itself can be edited at any time. Where it isn't
  // (a user install in someone's DMs) only the interaction can, for its first 15 minutes.
  const say = (line: string) => {
    const content = `${line}${below}`;
    message
      .edit({ content })
      .catch(() => interaction.editReply({ content }))
      .catch(() => undefined);
  };
  const taken = s.renders.enqueue({
    userId: interaction.user.id,
    source: { replay: bytes, filename: "replay.osr" },
    skin,
    onUpdate: (state) => {
      say(renderStatus(state));
      // A link alone in its own message, so Discord shows the video player under it.
      // Past 15 minutes outside a server the bot is in, the link goes to the person's DMs.
      if (state.kind === "done") {
        message
          .reply({ content: state.videoUrl, allowedMentions: { repliedUser: false, parse: [] } })
          .catch(() =>
            interaction.followUp({ content: state.videoUrl, allowedMentions: { parse: [] } }),
          )
          .catch(() => interaction.user.send(`Your render: ${state.videoUrl}`))
          .catch(() => undefined);
      }
    },
  });
  if (!taken.ok) {
    say(
      taken.reason === "already"
        ? "You already have a replay in line. Wait for it to start."
        : "The render line is full. Try again in a few minutes.",
    );
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
    const skin = interaction.options.getString("skin")?.trim() || "default";
    if (replay) {
      if (!replay.name.toLowerCase().endsWith(".osr")) {
        await fail(interaction, "That isn't a replay. Attach the `.osr` file osu! saves.");
        return;
      }
      if (replay.size > MAX_REPLAY_BYTES) {
        await fail(interaction, "That replay is over 10 MB, which is more than o!rdr takes.");
        return;
      }
      await interaction.deferReply();
      const bytes = await fetchReplay(replay.url);
      if (!bytes) {
        await fail(interaction, "Discord didn't hand over that file. Try attaching it again.");
        return;
      }
      await startRender(interaction, s, bytes, skin);
      return;
    }
    if (!scoreText) {
      await fail(interaction, "Give a `score` link or attach a `replay` (.osr).");
      return;
    }
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
    await startRender(interaction, s, bytes, skin);
  },
  /** render:osr:<channelId>:<messageId>, from an .osr card: renders the posted file. */
  async button(interaction, s, args) {
    const [kind, channelId, messageId] = args;
    if (kind !== "osr" || !channelId || !messageId) return;
    await interaction.deferReply();
    const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
    const posted = channel?.isTextBased()
      ? await channel.messages.fetch(messageId).catch(() => null)
      : null;
    const file = posted?.attachments.find((a) => a.name.toLowerCase().endsWith(".osr"));
    const bytes = file && file.size <= MAX_REPLAY_BYTES ? await fetchReplay(file.url) : null;
    if (!bytes) {
      await fail(interaction, "That replay isn't there anymore. Post it again or use **/render**.");
      return;
    }
    await startRender(interaction, s, bytes, "default");
  },
};
