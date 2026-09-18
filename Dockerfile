# ---- builder: compiles TypeScript and produces a pruned production node_modules ----
FROM node:22-slim AS builder

# better-sqlite3 and sqlite3 (a transitive dep of connect-sqlite3) both
# need build tools to compile their native modules
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm

WORKDIR /app

# pnpm-workspace.yaml must be present before install - it's what allows
# better-sqlite3/sqlite3's native build scripts to run at all (pnpm 10+
# blocks them by default). See the comment in that file for details.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
RUN pnpm run build

# Drop devDependencies (typescript, ts-node, @types/*) now that dist/ exists
RUN pnpm prune --prod

# ---- runtime: just the compiled app + production deps, no compiler toolchain ----
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
