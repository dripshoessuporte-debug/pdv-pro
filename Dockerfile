FROM node:22-slim

WORKDIR /app

RUN corepack enable
RUN corepack prepare pnpm@10.26.1 --activate

COPY . .

RUN pnpm install --no-frozen-lockfile
RUN PORT=5173 BASE_PATH=/ NODE_ENV=production pnpm --filter @workspace/restaurant-pdv build
RUN pnpm --filter @workspace/api-server build

ENV NODE_ENV=production
ENV FRONTEND_DIST=/app/artifacts/restaurant-pdv/dist/public
EXPOSE 3000

CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
