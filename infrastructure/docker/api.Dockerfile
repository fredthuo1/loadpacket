# Build from the repository root. No application secrets belong in image layers.
FROM node:24-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global pnpm@12.3.4
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
# Keep links inside the image instead of a machine-global virtual store.
RUN pnpm --filter api... install --frozen-lockfile --config.enable-global-virtual-store=false
COPY apps/api ./apps/api
COPY packages ./packages
# Prisma generation needs a syntactically valid URL; it does not connect/migrate.
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build pnpm --filter api exec prisma generate
RUN pnpm --filter api build

FROM base AS runtime
ENV NODE_ENV=production PORT=3001
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/prisma.config.ts ./apps/api/prisma.config.ts
RUN mkdir -p /data/loadpacket/documents && chown -R node:node /data/loadpacket \
    && chmod 700 /data/loadpacket/documents
WORKDIR /app/apps/api
USER node
EXPOSE 3001
# Operator MUST mount a durable volume and set DOCUMENT_STORAGE_ROOT explicitly.
# No anonymous VOLUME, migration-on-start, seed, or storage cleanup.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/src/main.js"]
