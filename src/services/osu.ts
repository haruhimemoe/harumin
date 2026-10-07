/**
 * @file src/services/osu.ts
 * @desc The one osu! client, with the shared budget bound into every call. Commands call
 *       `osu.getUserScores(...)` and never pass beforeCall themselves.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { createOsuClient, type OsuClient } from "@haruhimemoe/osu";
import { USER_AGENT } from "../constants.ts";
import type { Budget } from "./budget.ts";

/** The client methods harumin uses, with the budget already applied. */
export type Osu = {
  getUserProfile: OsuClient["getUserProfile"];
  getUserScores: OsuClient["getUserScores"];
  getBeatmapUserScores: OsuClient["getBeatmapUserScores"];
  getBeatmapScores: OsuClient["getBeatmapScores"];
  getBeatmap: OsuClient["getBeatmap"];
  getBeatmaps: OsuClient["getBeatmaps"];
  getBeatmapsets: OsuClient["getBeatmapsets"];
  getStarRating: OsuClient["getStarRating"];
  getMatch: OsuClient["getMatch"];
  getUsers: OsuClient["getUsers"];
};

/**
 * @function bindBudget
 * @param client {OsuClient} an osu! client
 * @param budget {Budget} the shared bucket
 * @returns {Osu} the same methods, each asking the budget before every call
 */
export const bindBudget = (client: OsuClient, budget: Budget): Osu => {
  const beforeCall = () => budget.acquire();
  return {
    getUserProfile: (user, options = {}) => client.getUserProfile(user, { ...options, beforeCall }),
    getUserScores: (id, type, options = {}) =>
      client.getUserScores(id, type, { ...options, beforeCall }),
    getBeatmapUserScores: (map, user, options = {}) =>
      client.getBeatmapUserScores(map, user, { ...options, beforeCall }),
    getBeatmapScores: (map, options = {}) =>
      client.getBeatmapScores(map, { ...options, beforeCall }),
    getBeatmap: (map, options = {}) => client.getBeatmap(map, { ...options, beforeCall }),
    getBeatmaps: (ids, options = {}) => client.getBeatmaps(ids, { ...options, beforeCall }),
    getBeatmapsets: (ids, options = {}) => client.getBeatmapsets(ids, { ...options, beforeCall }),
    getStarRating: (map, mods, options = {}) =>
      client.getStarRating(map, mods, { ...options, beforeCall }),
    getMatch: (match, options = {}) => client.getMatch(match, { ...options, beforeCall }),
    getUsers: (ids, options = {}) => client.getUsers(ids, { ...options, beforeCall }),
  };
};

/**
 * @function createOsu
 * @param credentials {{ clientId: string; clientSecret: string }} the osu! OAuth app
 * @param budget {Budget} the shared bucket
 * @returns {Osu} the bound client
 */
export const createOsu = (
  credentials: { clientId: string; clientSecret: string },
  budget: Budget,
): Osu => bindBudget(createOsuClient({ credentials, userAgent: USER_AGENT }), budget);
