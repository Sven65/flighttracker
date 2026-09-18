# ---- builder ----
FROM node:22-slim AS builder

# better-sqlite3/sqlite3 need these to compile their native modules
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
RUN pnpm run build
RUN pnpm prune --prod

# ---- runtime ----
FROM node:22-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./
COPY views ./views
COPY public ./public
COPY data ./data

EXPOSE 3000
CMD ["node", "dist/server.js"]
