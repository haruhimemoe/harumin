/**
 * @file src/registry.ts
 * @desc Every command, listed by hand (no folder scanning). The order is /help's order within a
 *       category and the site's command page order.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { compare } from "./commands/compare.ts";
import { evalCommand } from "./commands/eval.ts";
import { help } from "./commands/help.ts";
import { info } from "./commands/info.ts";
import { invite } from "./commands/invite.ts";
import { leaderboard } from "./commands/leaderboard.ts";
import { link } from "./commands/link.ts";
import { map } from "./commands/map.ts";
import { matchcost } from "./commands/matchcost.ts";
import { nochoke } from "./commands/nochoke.ts";
import { osu } from "./commands/osu.ts";
import { pack } from "./commands/pack.ts";
import { pool } from "./commands/pool.ts";
import { recent } from "./commands/recent.ts";
import { score } from "./commands/score.ts";
import { server } from "./commands/server.ts";
import { simulate } from "./commands/simulate.ts";
import { top } from "./commands/top.ts";
import { track } from "./commands/track.ts";
import type { Command } from "./types.ts";

/** Every command, dev-only ones included. */
export const COMMANDS: readonly Command[] = Object.freeze([
  osu,
  recent,
  top,
  score,
  map,
  leaderboard,
  compare,
  nochoke,
  simulate,
  server,
  track,
  matchcost,
  pack,
  pool,
  link,
  help,
  info,
  invite,
  evalCommand,
]);

/**
 * @function publicCommands
 * @returns {Command[]} the commands registered globally (everything but /eval)
 */
export const publicCommands = (): Command[] => COMMANDS.filter((command) => !command.devOnly);

/**
 * @function devCommands
 * @returns {Command[]} the commands registered only in DEV_GUILD_ID
 */
export const devCommands = (): Command[] => COMMANDS.filter((command) => command.devOnly);

/**
 * @function findCommand
 * @param name {string} a command name
 * @returns {Command | undefined} the command
 */
export const findCommand = (name: string): Command | undefined =>
  COMMANDS.find((command) => command.data.name === name);
