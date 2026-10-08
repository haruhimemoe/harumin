# harumin: the bot, its /track poller and the service routes the dashboard calls, in one process.
FROM oven/bun:1.4.2-slim AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.4.2-slim
# ffmpeg lays animated profile covers under /osu's card.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production CACHE_DIR=/app/.cache/osu SERVICE_PORT=8787
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
RUN mkdir -p /app/.cache/osu && chown -R bun:bun /app/.cache
USER bun
# Mount a volume here to keep downloaded .osu files across deploys.
VOLUME ["/app/.cache"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.SERVICE_PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["bun", "src/index.ts"]
