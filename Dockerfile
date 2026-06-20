FROM node:22-slim

WORKDIR /app

RUN corepack enable
RUN corepack prepare pnpm@10.26.1 --activate

COPY . .

RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @workspace/api-server build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["pnpm", "--filter", "@workspace/api-server", "start"]
