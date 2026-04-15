# ─────────────────────────────────────────────────────────────────────────────
# Build from the monorepo root:
#   docker build -f apps/api/Dockerfile -t autohub-api .
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable pnpm

# ── Install dependencies (workspace-aware) ────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
# Install only the deps needed for @autohub/api and its workspace deps
RUN pnpm install --frozen-lockfile --filter @autohub/api...

# ── Build ─────────────────────────────────────────────────────────────────────
FROM base AS builder
# Copy installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
# shared has no separate node_modules (deps hoisted to root)
# Copy source
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
COPY turbo.json ./
# Compile TypeScript
RUN cd apps/api && pnpm run build

# ── Runtime image ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY apps/api/package.json ./

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:4000/health || exit 1

CMD ["node", "dist/index.js"]
