# AGENTS.md

harumin: the osu! Discord bot. Bun 1.4, TypeScript, discord.js 14, slash commands only.

## Layout

- `src/index.ts`: startup and shutdown. The only file with side effects at import.
- `src/env.ts`: the env schema. `src/constants.ts`: colors, links, limits.
- `src/types.ts`: `Services` and `Command`.
- `src/registry.ts`: every command, listed by hand. `src/router.ts`: interactions to commands; custom ids are `<command>:<args>`.
- `src/commands/`: one file per top-level command. `shared.ts` has the player, map and mode options and replies.
- `src/views/`: work shared by commands and link cards (map card, pp, packs and pools).
- `src/embeds/`: pure builders, data in, `APIEmbed` out. No clients.
- `src/links/`: finding links in messages, exact host allowlist, never fetches.
- `src/listeners/links.ts`: the messageCreate listener (context, link cards).
- `src/services/`: budgeted osu! client, linking (identity DB, read-only), settings, channel context, members, .osu cache, pp (rosu-pp-js), tracks, packs and pools readers.
- `src/service/`: the HTTP routes the dashboard calls.
- `scripts/deploy.ts`, `scripts/export-commands.ts`: command registration, and the JSON the site's /commands page reads.

## Rules

- **Slash commands only.** No prefix commands.
- **Intents: Guilds, GuildMessages, MessageContent.** Never GuildMembers or GuildPresences. Membership comes from sightings (`services/members.ts`).
- **One osu! budget.** Every osu! call goes through `services/osu.ts`. The /track poller takes at most half.
- **Never host or send .osz files.** Only `.osu` text, from osu! itself, MD5-checked.
- **Other haruhime apps through their public routes only**, never their databases. The identity database is read-only.
- **`/eval` stays locked three ways**: registered only in `DEV_GUILD_ID`, run only for `OWNER_ID` in `DEV_GUILD_ID`, output ephemeral and redacted.
- **Settings shapes come from `@haruhimemoe/harumin-config`.** The site writes them; the bot reads.
- Embeds and links stay pure and tested. Commands stay thin.
- Code style: Biome. Every file starts with the `@file / @desc / @author / @created / @modified` header.

## Before calling a change done

```sh
bun run check && bun run typecheck && bun run test:coverage
```

When commands change, run `bun run export-commands` and commit the site's `src/data/commands.json`.
