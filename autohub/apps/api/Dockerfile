# ─────────────────────────────────────────────────────────────────────────────
# Build from the monorepo root (root directory = autohub/ in Railway)
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable pnpm

# ── Install ALL workspace dependencies ────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .pnpmfile.cjs ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
# --shamefully-hoist=false ensures each package gets its own node_modules
# so zod is in packages/shared/node_modules and dotenv is in apps/api/node_modules
RUN pnpm install --frozen-lockfile --shamefully-hoist=false

# ── Build ─────────────────────────────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
COPY turbo.json ./

RUN cd apps/api && pnpm run build

# ── Runtime image ─────────────────────────────────────────────────────────────
# WORKDIR is /app/apps/api so node_modules resolution walks up correctly:
#   /app/apps/api/node_modules  (dotenv, hono, stripe, etc.)
#   /app/node_modules           (hoisted shared deps)
FROM node:20-alpine AS runner
WORKDIR /app/apps/api
ENV NODE_ENV=production

COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/node_modules ./node_modules
COPY --from=builder /app/node_modules /app/node_modules
COPY apps/api/package.json ./

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:4000/health || exit 1

CMD ["node", "dist/index.js"]
