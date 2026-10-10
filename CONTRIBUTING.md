# Contributing

Bug reports and fixes are welcome. For anything bigger than a fix, open an [issue](https://github.com/haruhimemoe/harumin/issues) first so we can agree on it.

Read [AGENTS.md](./AGENTS.md) before changing code. It has the layout and code style.

## Setup

You need [Bun](https://bun.sh) (the version in `package.json`). The bot runs on Bun, not Node.

```sh
bun install
```

Copy `.env.example` to `.env` and fill it in (a Discord bot token, osu! OAuth client credentials, a MongoDB URI) to run the bot with `bun run dev`. The tests need none of it.

## Making a change

1. Branch from `main` (`feat/<topic>`, `fix/<topic>`).
2. Write a failing test in `tests/`, make it pass, and keep commits small. Use [Conventional Commits](https://www.conventionalcommits.org/).
3. Run the full check before opening a PR:

   ```sh
   bun run check && bun run typecheck && bun run test:coverage
   ```

4. Add a line to `CHANGELOG.md` under `## [Unreleased]`.
5. Open a PR. CI must be green before merge.
