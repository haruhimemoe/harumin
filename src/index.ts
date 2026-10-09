/**
 * @file src/index.ts
 * @desc Starts harumin: env, databases and their indexes, services, the Discord client (guilds,
 *       guild messages and message content: no members or presence intents), the dashboard's
 *       service routes, the /track poller and top.gg. Shuts down cleanly on SIGINT and SIGTERM.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Wed Oct 7, 2026
 */

import { HARUMIN_COLLECTIONS } from "@haruhimemoe/harumin-config";
import { beatmapUrl, userUrl } from "@haruhimemoe/osu/shapes";
import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import { MongoClient } from "mongodb";
import { linkButtons } from "./commands/shared.ts";
import { DB_NAME, IDENTITY_DB_NAME, VERSION } from "./constants.ts";
import { scoreEmbed } from "./embeds/osu.ts";
import { loadEnv } from "./env.ts";
import { createLinkListener } from "./listeners/links.ts";
import { createRouter } from "./router.ts";
import { guildChannels, manageableGuilds } from "./service/guilds.ts";
import { createServiceHandler } from "./service/handler.ts";
import { createAnimator } from "./services/animate.ts";
import { createApps } from "./services/apps.ts";
import { createBeatmapFiles } from "./services/beatmap-files.ts";
import { createBudget } from "./services/budget.ts";
import { createCards } from "./services/cards.ts";
import { createChannelContext } from "./services/context.ts";
import { createLinking, identityBatchLookup, identityLookup } from "./services/linking.ts";
import { createLookups } from "./services/lookups.ts";
import { createMembers, MEMBER_INDEXES } from "./services/members.ts";
import { createOsu } from "./services/osu.ts";
import { createServerRows } from "./services/serverRows.ts";
import { createSettings, mongoSettingsLoader } from "./services/settings.ts";
import { createTracks, TRACK_INDEXES } from "./services/tracks.ts";
import { createUserSettings, mongoUserSettingsLoader } from "./services/userSettings.ts";
import type { Services } from "./types.ts";
import { startTopgg } from "./utils/topgg.ts";
import { toScoreCard } from "./views/cards.ts";

const log = (message: string, error?: unknown) => {
  if (error === undefined) console.log(`[harumin] ${message}`);
  else console.error(`[harumin] ${message}`, error);
};

const env = loadEnv(process.env);

const mongo = new MongoClient(env.MONGODB_URI);
const identityMongo = new MongoClient(env.IDENTITY_MONGODB_URI, {
  readPreference: "secondaryPreferred",
});
await Promise.all([mongo.connect(), identityMongo.connect()]);
const db = mongo.db(DB_NAME);
const identityDb = identityMongo.db(IDENTITY_DB_NAME);

const ensureIndexes = async () => {
  await db
    .collection(HARUMIN_COLLECTIONS.members)
    .createIndexes(MEMBER_INDEXES.map((spec) => ({ ...spec, key: { ...spec.key } })));
  await db
    .collection(HARUMIN_COLLECTIONS.tracks)
    .createIndexes(TRACK_INDEXES.map((spec) => ({ ...spec, key: { ...spec.key } })));
  await db
    .collection(HARUMIN_COLLECTIONS.trackState)
    .createIndex({ osuId: 1, mode: 1 }, { unique: true });
  await db
    .collection(HARUMIN_COLLECTIONS.guildSettings)
    .createIndex({ guildId: 1 }, { unique: true });
};
await ensureIndexes().catch((error) => log("index build failed (continuing)", error));

const budget = createBudget({ perMinute: env.OSU_RATE_PER_MINUTE });
const fileBudget = createBudget({ perMinute: 240, burst: 60 });
const osu = createOsu({ clientId: env.OSU_CLIENT_ID, clientSecret: env.OSU_CLIENT_SECRET }, budget);

const services: Services = {
  env,
  osu,
  linking: createLinking(identityLookup(identityDb), identityBatchLookup(identityDb)),
  settings: createSettings(mongoSettingsLoader(db)),
  context: createChannelContext(),
  lookups: createLookups(),
  serverRows: createServerRows(),
  userSettings: createUserSettings(mongoUserSettingsLoader(db)),
  members: createMembers(db),
  beatmaps: createBeatmapFiles({
    dir: env.CACHE_DIR,
    beforeFetch: () => fileBudget.acquire(10_000),
  }),
  tracks: createTracks(db, osu, { perMinute: env.OSU_RATE_PER_MINUTE, log }),
  apps: createApps(env.POOLS_SERVICE_SECRET ? { poolsSecret: env.POOLS_SERVICE_SECRET } : {}),
  cards: createCards({ siteUrl: env.SITE_URL, token: env.HARUMIN_SERVICE_TOKEN, log }),
  animate: createAnimator({ log }),
  startedAt: Date.now(),
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
  allowedMentions: { parse: [], repliedUser: false },
});

client.on(Events.InteractionCreate, createRouter(services, log));
client.on(Events.MessageCreate, createLinkListener(services, log));
client.on(Events.Error, (error) => log("client error", error));

let stopTopgg: () => void = () => undefined;

client.once(Events.ClientReady, (ready) => {
  log(`${VERSION} ready as ${ready.user.tag} in ${ready.guilds.cache.size} servers`);
  services.tracks.start(async (channelId, score, place) => {
    const channel = await ready.channels.fetch(channelId).catch(() => null);
    if (!channel?.isSendable()) return;
    const heading = `New top play #${place}`;
    const links = linkButtons([
      { label: "Beatmap", url: beatmapUrl(score.beatmapId) },
      { label: "osu! profile", url: `${userUrl(score.userId)}/${score.ruleset}` },
    ]);
    const profile = await services.osu
      .getUserProfile(score.userId, { ruleset: score.ruleset })
      .catch(() => null);
    const png = profile
      ? await services.cards.draw(
          "score",
          toScoreCard(score, { profile, ruleset: score.ruleset, pp: null, heading, tries: 1 }),
        )
      : null;
    await channel.send(
      png
        ? { files: [{ attachment: png, name: "top-play.png" }], components: links }
        : { embeds: [scoreEmbed(score, { pp: null, heading })], components: links },
    );
  });
  stopTopgg = startTopgg({
    token: env.TOPGG_TOKEN,
    botId: ready.user.id,
    guildCount: () => ready.guilds.cache.size,
    log,
  });
});

const flushTimer = setInterval(() => {
  services.members.flush().catch((error) => log("member flush failed", error));
}, 60_000);

const server = Bun.serve({
  port: env.SERVICE_PORT,
  fetch: createServiceHandler({
    token: env.HARUMIN_SERVICE_TOKEN,
    manageableGuilds: (discordId) => manageableGuilds(client, services.members, discordId),
    guildChannels: async (guildId) => guildChannels(client, guildId),
    revalidate: (guildId) => services.settings.invalidate(guildId),
    revalidateUser: (osuId) => services.userSettings.drop(osuId),
  }),
});
log(`service routes on :${server.port}`);

let stopping = false;
const shutdown = async (signal: string) => {
  if (stopping) return;
  stopping = true;
  log(`${signal}: shutting down`);
  services.tracks.stop();
  stopTopgg();
  clearInterval(flushTimer);
  await services.members.flush().catch(() => undefined);
  server.stop();
  await client.destroy();
  await Promise.all([mongo.close(), identityMongo.close()]);
  process.exit(signal === "login failure" ? 1 : 0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await client.login(env.DISCORD_TOKEN);
} catch (error) {
  log("Discord login failed", error);
  await shutdown("login failure");
}
