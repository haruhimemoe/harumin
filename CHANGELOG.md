# Changelog

## [Unreleased]

### Added

- harumin answers in the asker's Discord language and link cards in the server's, from the `harumin-bot` catalog of `@haruhimemoe/messages` (English fills any gap). Command descriptions and choices register with Discord's localizations for every catalog language; names stay English. Card images follow the same language. English only for now.

### Changed

- CI runs CodeQL and a gitleaks scan of the full git history, and Dependabot covers dependencies and pinned actions. Dependencies are on their latest versions.

### Added

- The rewrite: Bun, discord.js 14, slash commands only, on the haruhime libraries.
- osu!: `/osu`, `/recent`, `/top`, `/score`, `/map`, `/leaderboard`, `/compare`, `/nochoke`, `/simulate`, `/server`, `/track`, `/matchcost`. Local pp with rosu-pp-js.
- haruhime tools: `/pack`, `/pool view|check|parse`.
- Link cards for beatmaps, matches, packs, pack keys, pools and bb templates, each toggled per server on the dashboard. Each channel remembers its last map, match, pack and pool for commands left empty.
- `/link` through the haruhime.moe accounts hub.
- Service routes for harumin.haruhime.moe's dashboard.
