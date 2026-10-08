/**
 * @file src/types.ts
 * @desc The shapes the bot is built from: Services (everything a command may use, made once in
 *       index.ts) and Command (one top-level slash command with its buttons and modals).
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Wed Oct 7, 2026
 */

import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  ModalSubmitInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord.js";
import type { Env } from "./env.ts";
import type { Animator } from "./services/animate.ts";
import type { Apps } from "./services/apps.ts";
import type { BeatmapFiles } from "./services/beatmap-files.ts";
import type { Cards } from "./services/cards.ts";
import type { ChannelContext } from "./services/context.ts";
import type { Linking } from "./services/linking.ts";
import type { Members } from "./services/members.ts";
import type { Osu } from "./services/osu.ts";
import type { Settings } from "./services/settings.ts";
import type { Tracks } from "./services/tracks.ts";

/** Everything a command may use. */
export type Services = {
  env: Env;
  osu: Osu;
  linking: Linking;
  settings: Settings;
  context: ChannelContext;
  members: Members;
  beatmaps: BeatmapFiles;
  tracks: Tracks;
  apps: Apps;
  cards: Cards;
  animate: Animator;
  startedAt: number;
};

/** Where /help and the site list a command. */
export type Category = "osu" | "haruhime" | "bot";

/** One top-level slash command. */
export type Command = {
  data: RESTPostAPIChatInputApplicationCommandsJSONBody;
  category: Category;
  /** Registered only in DEV_GUILD_ID (/eval). */
  devOnly?: boolean;
  execute: (interaction: ChatInputCommandInteraction, services: Services) => Promise<void>;
  /** Buttons whose custom id starts with "<name>:"; args are the rest, split on ":". */
  button?: (interaction: ButtonInteraction, services: Services, args: string[]) => Promise<void>;
  /** Modals whose custom id starts with "<name>:". */
  modal?: (
    interaction: ModalSubmitInteraction,
    services: Services,
    args: string[],
  ) => Promise<void>;
};
