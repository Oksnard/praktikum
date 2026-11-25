FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv antiword procps openssl ca-certificates && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/parser && /opt/parser/bin/pip install --no-cache-dir pypdf==6.14.2 \
    && corepack enable && corepack prepare pnpm@10.11.0 --activate
ENV PATH="/opt/parser/bin:$PATH" NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --chown=node:node . .
RUN pnpm install --frozen-lockfile && pnpm db:generate \
    && pnpm --filter @praktikum/types build && pnpm --filter @praktikum/api build && pnpm --filter @praktikum/web build \
    && chown -R node:node /app
USER node
ENV NODE_ENV=production
EXPOSE 10000
CMD ["node", "deploy/cloud/start.mjs"]
