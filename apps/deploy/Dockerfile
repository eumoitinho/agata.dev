# Multi-stage Dockerfile for Deploy service (Azure Container Apps)
FROM oven/bun:1.2.19 as base
WORKDIR /app

# Leverage monorepo root (context should be repo root when building)
# Copy only manifests first for better layer caching
COPY bun.lock package.json turbo.json ./
COPY packages ./packages
COPY apps/deploy/package.json ./apps/deploy/package.json

# Install dependencies (will hoist via Bun workspaces)
RUN bun install --frozen-lockfile

# Copy source (only deploy app to reduce context; adjust for shared build if needed)
COPY apps/deploy ./apps/deploy

# Build step (optional; Hono can run TS via tsx at runtime)
# Uncomment to produce JS build if you want faster startup
# RUN cd apps/deploy && bun run build

FROM oven/bun:1.2.19 AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Copy only what we need from build layer
COPY --from=base /app /app

# Expose application port
EXPOSE 8080

# Start the service using the Azure entrypoint (tsx loader)
WORKDIR /app/apps/deploy
CMD ["bun", "run", "start:azure"]
