FROM oven/bun:1 AS client-builder

WORKDIR /app/client

COPY client/package.json client/bun.lock ./
RUN bun install

COPY client/ .
RUN bun run build

FROM rust:1-slim AS runner-builder

WORKDIR /app/runner
COPY runner/Cargo.toml runner/Cargo.lock* ./
COPY runner/src ./src
RUN cargo build --release

FROM oven/bun:1

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install

ENV NODE_ENV=production
ENV LOG_LEVEL=system

WORKDIR /app

COPY --from=client-builder /app/client/dist ./dist
COPY --from=runner-builder /app/runner/target/release/runner ./bin/runner

COPY --from=server-builder /app/server ./server
COPY --from=server-builder /app/node_modules ./node_modules
COPY --from=server-builder /app/package.json ./
COPY --from=server-builder /app/bun.lock ./

EXPOSE 5979

CMD ["bun", "server/index.js"]