/**
 * @file src/service/handler.ts
 * @desc The HTTP routes harumin.haruhime.moe calls (SERVICE_ROUTES in harumin-config), as a plain
 *       Request to Response function so tests run it without a server. Every route but /health
 *       needs `Authorization: Bearer <HARUMIN_SERVICE_TOKEN>`, compared in constant time. The
 *       guild list for a Discord id comes from the bot, never from the caller.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Thu Oct 8, 2026
 */

import { createHash, timingSafeEqual } from "node:crypto";
import {
  type GuildChannels,
  type ManageableGuilds,
  revalidateBodySchema,
  revalidateUserBodySchema,
  SERVICE_ROUTES,
  snowflakeSchema,
} from "@haruhimemoe/harumin-config";

/** What the routes need from the bot. */
export type ServiceDeps = {
  token: string;
  manageableGuilds: (discordId: string) => Promise<ManageableGuilds["guilds"]>;
  guildChannels: (guildId: string) => Promise<GuildChannels["channels"] | null>;
  revalidate: (guildId: string) => void;
  /** Drops a player's cached card settings. */
  revalidateUser: (osuId: number) => void;
};

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * @function bearerMatches
 * @param header {string | null} the Authorization header
 * @param token {string} the expected token
 * @returns {boolean} true for exactly "Bearer <token>", compared in constant time
 */
export const bearerMatches = (header: string | null, token: string): boolean => {
  if (!header?.startsWith("Bearer ")) return false;
  return timingSafeEqual(digest(header.slice(7)), digest(token));
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const CHANNELS_PATH = /^\/guilds\/(\d{17,20})\/channels$/;

/**
 * @function createServiceHandler
 * @param deps {ServiceDeps} the token and the bot's answers
 * @returns {(request: Request) => Promise<Response>} the router
 */
export const createServiceHandler =
  (deps: ServiceDeps) =>
  async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (url.pathname === "/health") return json({ ok: true });
    if (!bearerMatches(request.headers.get("authorization"), deps.token)) {
      return json({ error: "unauthorized" }, 401);
    }
    if (request.method === "GET" && url.pathname === SERVICE_ROUTES.manageableGuilds) {
      const discordId = snowflakeSchema.safeParse(url.searchParams.get("discordId"));
      if (!discordId.success) return json({ error: "discordId must be a Discord id" }, 400);
      return json({
        guilds: await deps.manageableGuilds(discordId.data),
      } satisfies ManageableGuilds);
    }
    const channels = CHANNELS_PATH.exec(url.pathname);
    if (request.method === "GET" && channels?.[1]) {
      const list = await deps.guildChannels(channels[1]);
      return list
        ? json({ channels: list } satisfies GuildChannels)
        : json({ error: "unknown guild" }, 404);
    }
    if (request.method === "POST" && url.pathname === SERVICE_ROUTES.revalidate) {
      const body = revalidateBodySchema.safeParse(await request.json().catch(() => null));
      if (!body.success) return json({ error: "body must be { guildId }" }, 400);
      deps.revalidate(body.data.guildId);
      return new Response(null, { status: 204 });
    }
    if (request.method === "POST" && url.pathname === SERVICE_ROUTES.revalidateUser) {
      const body = revalidateUserBodySchema.safeParse(await request.json().catch(() => null));
      if (!body.success) return json({ error: "body must be { osuId }" }, 400);
      deps.revalidateUser(body.data.osuId);
      return new Response(null, { status: 204 });
    }
    return json({ error: "not found" }, 404);
  };
