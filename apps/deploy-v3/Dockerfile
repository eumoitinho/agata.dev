# Use Bun official image as base
FROM oven/bun:1.2.19-alpine AS base

# Set working directory
WORKDIR /app

# Install system dependencies for Azure SDK
RUN apk add --no-cache \
    ca-certificates \
    curl \
    dumb-init \
    && addgroup -g 1001 -S agatta \
    && adduser -S agatta -u 1001

# Copy package manager files
FROM base AS deps
COPY package.json bun.lockb* ./
COPY packages/db/package.json ./packages/db/
COPY packages/api/package.json ./packages/api/
COPY packages/common/package.json ./packages/common/

# Install dependencies
RUN bun install --frozen-lockfile

# Build stage
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY . .

# Build the application
ENV NODE_ENV=production
RUN bun run build

# Production stage
FROM base AS runner

# Copy runtime files
COPY --from=builder --chown=agatta:agatta /app/dist ./dist
COPY --from=builder --chown=agatta:agatta /app/node_modules ./node_modules
COPY --from=builder --chown=agatta:agatta /app/package.json ./

# Create non-root user
USER agatta

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# Expose ports
EXPOSE 3010 8080

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["bun", "run", "dist/azure-entrypoint.js"]