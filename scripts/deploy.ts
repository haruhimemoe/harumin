/**
 * @file scripts/deploy.ts
 * @desc `bun run deploy`: registers harumin's slash commands. Every public command globally (this
 *       replaces the old app's commands), /eval only in DEV_GUILD_ID. `--dev` puts everything in
 *       the dev guild instead, for testing (guild commands update at once).
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { REST, Routes } from "discord.js";
import { z } from "zod";
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

const everything = [...publicCommands(), ...devCommands()].map((command) => command.data);
if (dev) {
  await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DEV_GUILD_ID), {
    body: everything,
  });
  console.log(`dev guild: ${everything.length} commands`);
} else {
  const global = publicCommands().map((command) => command.data);
  await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), { body: global });
  await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DEV_GUILD_ID), {
    body: devCommands().map((command) => command.data),
  });
  console.log(`global: ${global.length} commands; dev guild: ${devCommands().length}`);
}
