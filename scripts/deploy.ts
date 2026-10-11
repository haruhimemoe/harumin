/**
 * @file scripts/deploy.ts
 * @desc `bun run deploy`: registers harumin's slash commands. Every public command globally (this
 *       replaces the old app's commands), /eval only in DEV_GUILD_ID. `--dev` puts everything in
 *       the dev guild instead, for testing (guild commands update at once).
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Sun Oct 11, 2026
 */

import { REST, Routes } from "discord.js";
import { z } from "zod";
import { localizeCommands } from "../src/i18n-commands.ts";
import { devCommands, publicCommands } from "../src/registry.ts";

const env = z
  .object({
    DISCORD_TOKEN: z.string().min(1),
    DISCORD_CLIENT_ID: z.string().min(1),
    DEV_GUILD_ID: z.string().min(1),
  })
  .parse(process.env);
const rest = new REST().setToken(env.DISCORD_TOKEN);
const dev = process.argv.includes("--dev");

// Descriptions and choices get every catalog language Discord shows (src/i18n-commands.ts).
const everything = await localizeCommands(
  [...publicCommands(), ...devCommands()].map((command) => command.data),
);
if (dev) {
  await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DEV_GUILD_ID), {
    body: everything,
  });
  console.log(`dev guild: ${everything.length} commands`);
} else {
  const global = await localizeCommands(publicCommands().map((command) => command.data));
  await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), { body: global });
  await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DEV_GUILD_ID), {
    body: await localizeCommands(devCommands().map((command) => command.data)),
  });
  console.log(`global: ${global.length} commands; dev guild: ${devCommands().length}`);
}
