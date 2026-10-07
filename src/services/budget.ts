/**
 * @file src/services/budget.ts
 * @desc A token bucket for osu! calls: `perMinute` tokens a minute, refilled continuously, with a
 *       burst of a quarter minute's worth. Every command and the /track poller share one, so a
 *       busy guild can't push the bot past osu!'s limit. `acquire` waits a little for a token
 *       before giving up; the osu! client turns a refusal into a "budget" error.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

/** createBudget's options. `now` and `sleep` are for tests. */
export type BudgetOptions = {
  perMinute: number;
  burst?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

/** The bucket. */
export type Budget = {
  /** Takes a token if one is there. */
  take: () => boolean;
  /** Takes a token, waiting up to maxWaitMs for one. */
  acquire: (maxWaitMs?: number) => Promise<boolean>;
  /** Tokens there now (fractional). */
  available: () => number;
};

/**
 * @function createBudget
 * @param options {BudgetOptions} the rate, burst, and clock
 * @returns {Budget} a bucket that starts full
 */
export const createBudget = ({
  perMinute,
  burst = Math.max(1, Math.ceil(perMinute / 4)),
  now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}: BudgetOptions): Budget => {
  const perMs = perMinute / 60_000;
  let tokens = burst;
  let last = now();

  const refill = () => {
    const at = now();
    tokens = Math.min(burst, tokens + (at - last) * perMs);
    last = at;
  };

  const take = () => {
    refill();
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };

  return {
    take,
    available: () => {
      refill();
      return tokens;
    },
    async acquire(maxWaitMs = 5_000) {
      const deadline = now() + maxWaitMs;
      while (!take()) {
        const wait = Math.ceil((1 - tokens) / perMs);
        if (now() + wait > deadline) return false;
        await sleep(wait);
      }
      return true;
    },
  };
};
