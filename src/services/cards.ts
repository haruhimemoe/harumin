/**
 * @file src/services/cards.ts
 * @desc Card images from harumin.haruhime.moe: post a card (harumin-config's CARD_ROUTES, bearer
 *       HARUMIN_SERVICE_TOKEN), get a PNG. Best effort: a card that doesn't parse, a slow or
 *       failed answer, or anything but a PNG comes back as null, and the command sends its text
 *       embed instead. Notice cards are kept a day by their exact text, so a repeated error
 *       or confirmation costs no request.
 * @author David @dvhsh (https://dvh.sh)
 * @created Wed Oct 7, 2026
 * @modified Sun Oct 11, 2026
 */

import {
  type BbCard,
  bbCardSchema,
  CARD_ROUTES,
  type CompareCard,
  compareCardSchema,
  type InfoCard,
  type InviteCard,
  infoCardSchema,
  inviteCardSchema,
  type LeaderboardCard,
  type LinkCard,
  leaderboardCardSchema,
  linkCardSchema,
  type MapCard,
  type MatchCostCard,
  mapCardSchema,
  matchCostCardSchema,
  type NoticeCard,
  noticeCardSchema,
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
import { currentLocale } from "../i18n.ts";
import { createTtlCache } from "./cache.ts";

/** Notices repeat word for word, so a drawn one is kept a day (500 at most). */
const NOTICE_TTL_MS = 24 * 60 * 60_000;
const NOTICE_CACHE_SIZE = 500;

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
  info: InfoCard;
  link: LinkCard;
  invite: InviteCard;
  notice: NoticeCard;
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
  info: infoCardSchema,
  link: linkCardSchema,
  invite: inviteCardSchema,
  notice: noticeCardSchema,
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
}: CardsOptions): Cards => {
  const notices = createTtlCache<string, Buffer>(NOTICE_TTL_MS, NOTICE_CACHE_SIZE);
  const fetchCard = async <K extends CardKind>(
    kind: K,
    card: CardInputs[K],
  ): Promise<Buffer | null> => {
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
          // The card's words follow the asker's language (src/i18n.ts).
          "Accept-Language": currentLocale(),
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
  };
  return {
    async draw(kind, card) {
      if (kind !== "notice") return fetchCard(kind, card);
      const key = JSON.stringify(card);
      const kept = notices.get(key);
      if (kept) return kept;
      const png = await fetchCard(kind, card);
      if (png) notices.set(key, png);
      return png;
    },
  };
};
