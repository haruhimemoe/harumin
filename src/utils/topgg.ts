/**
 * @file src/utils/topgg.ts
 * @desc Posts the server count to top.gg every 30 minutes, only when TOPGG_TOKEN is set. Plain
 *       fetch, no autoposter package.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

const EVERY_MS = 30 * 60_000;

/**
 * @function startTopgg
 * @param options {{ token: string | undefined; botId: string; guildCount: () => number; log: (message: string, error?: unknown) => void }}
 * @returns {() => void} stops posting (a no-op without a token)
 */
export const startTopgg = ({
  token,
  botId,
  guildCount,
  log,
}: {
  token: string | undefined;
  botId: string;
  guildCount: () => number;
  log: (message: string, error?: unknown) => void;
}): (() => void) => {
  if (!token) return () => undefined;
  const post = async () => {
    try {
      const response = await fetch(`https://top.gg/api/bots/${botId}/stats`, {
        method: "POST",
        headers: { Authorization: token, "Content-Type": "application/json" },
        body: JSON.stringify({ server_count: guildCount() }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) log(`top.gg answered ${response.status}`);
    } catch (error) {
      log("top.gg post failed", error);
    }
  };
  void post();
  const timer = setInterval(post, EVERY_MS);
  return () => clearInterval(timer);
};
