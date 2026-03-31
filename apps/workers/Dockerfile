FROM node:20-alpine AS base
RUN npm install -g pnpm@9
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/types/package.json ./packages/types/
COPY packages/config/package.json ./packages/config/
COPY packages/db/package.json ./packages/db/
COPY apps/workers/package.json ./apps/workers/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY packages/ ./packages/
COPY apps/workers/ ./apps/workers/
RUN pnpm --filter @auto-recruit/db exec prisma generate
RUN pnpm --filter @auto-recruit/types build
RUN pnpm --filter @auto-recruit/config build
RUN pnpm --filter @auto-recruit/db build
RUN pnpm --filter workers build

FROM node:20-alpine AS runner
RUN npm install -g pnpm@9
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/workers/dist ./apps/workers/dist
COPY --from=build /app/apps/workers/package.json ./apps/workers/package.json

EXPOSE 8081
CMD ["node", "apps/workers/dist/index.js"]
