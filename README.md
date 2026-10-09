| `/practice` | Maps like your top plays, a bit harder, from pools.haruhime.moe, with a pack link |
# harumin

An osu! Discord bot from [haruhime.moe](https://haruhime.moe). Slash commands only.

[Add it to your server](https://harumin.haruhime.moe) · [Commands](https://harumin.haruhime.moe/commands) · [Dashboard](https://harumin.haruhime.moe/dashboard) · [Support](https://haruhime.moe/discord)

## Commands

| Command | What it does |
| --- | --- |
| `/osu` | A player's profile |
| `/recent` | Most recent play, with full-combo pp |
| `/top` | Top plays, sorted and filtered by mods |
| `/score` | Your scores on a map |
| `/map` | A map's stats and pp at 95 to 100% |
| `/leaderboard` | A map's global top 100 |
| `/compare` | Two players head to head |
| `/nochoke` | Top plays if every choke were a full combo |
| `/simulate` | pp for a score you describe |
| `/server` | This server's linked players, ranked |
| `/track` | Post a player's new top plays in a channel |
| `/matchcost` | Match costs for a multiplayer match |
| `/pack` | A pack from packs.haruhime.moe |
| `/pool view`, `/pool check`, `/pool parse` | Pools from pools.haruhime.moe, osu!'s content rules check, and reading a pasted pool |
| `/link`, `/help`, `/info`, `/invite` | Linking, help, about, invite |

Player options take an osu! name, a profile link or `#id`, or a Discord member. Left empty, they use your own linked account. Map options left empty use the last map linked in the channel.

## Linking

Sign in on [haruhime.moe/account](https://haruhime.moe/account) with osu!, then link Discord there. One account works for every haruhime tool.

## Link cards

harumin answers beatmap, pack and pool links with a card. Match and bb links can get one too. Server managers turn each kind on or off on the [dashboard](https://harumin.haruhime.moe/dashboard).

## Running your own

Needs [Bun](https://bun.sh) 1.4, MongoDB, a Discord application and an osu! OAuth app.

```sh
bun install
cp .env.example .env   # fill it in
bun run deploy         # registers the slash commands
bun start
```

`bun run deploy --dev` registers every command in `DEV_GUILD_ID` only, which updates instantly.

## License

MIT
