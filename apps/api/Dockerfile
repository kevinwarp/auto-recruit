FROM node:20-alpine AS base
RUN npm install -g pnpm@9
WORKDIR /app

# ── deps stage: install all workspace deps ─────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/types/package.json ./packages/types/
COPY packages/config/package.json ./packages/config/
COPY packages/db/package.json ./packages/db/
COPY apps/api/package.json ./apps/api/
RUN pnpm install --frozen-lockfile

# ── build stage ────────────────────────────────────────────────────────────────
FROM deps AS build
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/
# Generate Prisma client
RUN pnpm --filter @auto-recruit/db exec prisma generate
# Build shared packages then API
RUN pnpm --filter @auto-recruit/types build
RUN pnpm --filter @auto-recruit/config build
RUN pnpm --filter @auto-recruit/db build
RUN pnpm --filter api build

# ── runtime stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN npm install -g pnpm@9
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json

EXPOSE 8080
CMD ["node", "apps/api/dist/index.js"]
