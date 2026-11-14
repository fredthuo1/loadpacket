# Build from the repository root using the existing .dockerignore.
# Only public client configuration belongs in build arguments, never secrets.
FROM node:24-bookworm-slim AS base
RUN npm install --global pnpm@12.3.4
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/package.json
# Preserve pnpm's workspace link layout inside the image.
RUN pnpm --filter web... install --frozen-lockfile --config.enable-global-virtual-store=false
COPY apps/web ./apps/web
# Web imports these declarations directly; they have no runtime dependencies.
COPY packages/api-contracts ./packages/api-contracts

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL} \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}
# Fail rather than silently building the application's localhost fallback.
# Do not echo configuration values. NEXT_PUBLIC values are compiled into JS.
RUN test -n "$NEXT_PUBLIC_API_URL" \
    && test -n "$NEXT_PUBLIC_SUPABASE_URL" \
    && test -n "$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
    && mkdir -p apps/web/public \
    && pnpm --filter web build

FROM base AS runtime
ENV NODE_ENV=production PORT=3000
# Keep the existing next start model, including dependencies for next.config.ts.
# Copy only runtime inputs; no source tree, local env files, API or private storage.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=build /app/apps/web/package.json /app/apps/web/next.config.ts ./apps/web/
COPY --from=build --chown=node:node /app/apps/web/.next ./apps/web/.next
COPY --from=build /app/apps/web/public ./apps/web/public
WORKDIR /app/apps/web
USER node
EXPOSE 3000
# exec forwards stop signals; PORT is supplied by Render at container startup.
CMD ["sh", "-c", "exec node node_modules/next/dist/bin/next start --hostname 0.0.0.0 --port \"${PORT:-3000}\""]
