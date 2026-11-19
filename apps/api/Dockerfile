# Build depuis la racine du monorepo :
#   docker build -f apps/api/Dockerfile -t brumeterre-api .
FROM node:22-slim AS build
WORKDIR /repo
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/game-core/package.json packages/game-core/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @brumeterre/api...
COPY packages/game-core packages/game-core
COPY apps/api apps/api
RUN pnpm --filter @brumeterre/api build \
  && pnpm --filter @brumeterre/api deploy --prod --legacy /out

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/package.json ./
USER node
EXPOSE 8787
CMD ["node", "dist/index.js"]
