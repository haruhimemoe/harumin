/**
 * @file src/services/cards.ts
 * @desc Card images from harumin.haruhime.moe: post a card (harumin-config's CARD_ROUTES, bearer
 *       HARUMIN_SERVICE_TOKEN), get a PNG. Best effort: a card that doesn't parse, a slow or
 *       failed answer, or anything but a PNG comes back as null, and the command sends its text
 *       embed instead.
 * @author David @dvhsh (https://dvh.sh)
 * @created Wed Oct 7, 2026
 * @modified Thu Oct 8, 2026
 */

import {
  type BbCard,
  bbCardSchema,
  CARD_ROUTES,
  type CompareCard,
  compareCardSchema,
  type LeaderboardCard,
  leaderboardCardSchema,
  type MapCard,
  type MatchCostCard,
  mapCardSchema,
  matchCostCardSchema,
  type PoolCard,
  type ProfileCard,
  poolCardSchema,
  profileCardSchema,
  type ScoreCard,
  type ScoreListCard,
  type ServerCard,
  type SimulateCard,
  scoreCardSchema,
  scoreListCardSchema,
  serverCardSchema,
  simulateCardSchema,
  type TracksCard,
  tracksCardSchema,
} from "@haruhimemoe/harumin-config";
import type { z } from "zod";
import { USER_AGENT } from "../constants.ts";

/** What each card route takes. */
export type CardInputs = {
  profile: ProfileCard;
  score: ScoreCard;
  scores: ScoreListCard;
  map: MapCard;
  leaderboard: LeaderboardCard;
  simulate: SimulateCard;
  compare: CompareCard;
  matchcost: MatchCostCard;
  pool: PoolCard;
  server: ServerCard;
  tracks: TracksCard;
  bb: BbCard;
};

/** One of the card routes. */
export type CardKind = keyof CardInputs;

const SCHEMAS: { [K in CardKind]: z.ZodType<CardInputs[K]> } = {
  profile: profileCardSchema,
  score: scoreCardSchema,
  scores: scoreListCardSchema,
  map: mapCardSchema,
  leaderboard: leaderboardCardSchema,
  simulate: simulateCardSchema,
  compare: compareCardSchema,
  matchcost: matchCostCardSchema,
  pool: poolCardSchema,
  server: serverCardSchema,
  tracks: tracksCardSchema,
  bb: bbCardSchema,
};

/** The drawer. */
export type Cards = {
  draw: <K extends CardKind>(kind: K, card: CardInputs[K]) => Promise<Buffer | null>;
};

/** createCards' options. */
export type CardsOptions = {
  siteUrl: string;
  token: string;
  /** How long to wait for the image (default 4 seconds). */
  timeoutMs?: number;
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
  log?: (message: string, error?: unknown) => void;
};

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

/**
 * @function createCards
 * @param options {CardsOptions} the site, the token, the wait, fetch and log (tests)
 * @returns {Cards} draw(kind, card): the PNG, or null when it couldn't be had
 */
export const createCards = ({
  siteUrl,
  token,
  timeoutMs = 4_000,
  fetch = globalThis.fetch,
  log = () => undefined,
}: CardsOptions): Cards => ({
  async draw(kind, card) {
    const parsed = SCHEMAS[kind].safeParse(card);
    if (!parsed.success) {
      log(`card ${kind} doesn't parse`, parsed.error.issues[0]?.message);
      return null;
    }
    try {
      const response = await fetch(new URL(CARD_ROUTES[kind], siteUrl).href, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "image/png",
          "User-Agent": USER_AGENT,
        },
        body: JSON.stringify(parsed.data),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        log(`card ${kind} answered ${response.status}`);
        return null;
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!PNG_MAGIC.every((byte, i) => bytes[i] === byte)) {
        log(`card ${kind} wasn't a PNG`);
        return null;
      }
      return bytes;
    } catch (error) {
      log(`card ${kind} failed`, error);
      return null;
    }
  },
});
