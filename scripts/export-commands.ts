/**
 * @file scripts/export-commands.ts
 * @desc `bun run export-commands [path]`: writes the public commands as JSON for the site's
 *       /commands page (default: ../harumin.haruhime.moe/src/data/commands.json). The site never
 *       imports the bot; it reads this file, regenerated when commands change.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { exportCommands } from "../src/export.ts";

const target = path.resolve(process.argv[2] ?? "../harumin.haruhime.moe/src/data/commands.json");
await writeFile(target, `${JSON.stringify(exportCommands(), null, 2)}\n`);
console.log(`wrote ${target}`);
