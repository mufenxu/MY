FROM node:24-bookworm-slim AS deps

ARG APT_MIRROR=

WORKDIR /app

COPY package*.json ./

RUN if [ -n "$APT_MIRROR" ]; then \
      sed -i "s|http://deb.debian.org/debian|${APT_MIRROR}/debian|g; s|http://deb.debian.org/debian-security|${APT_MIRROR}/debian-security|g" /etc/apt/sources.list.d/debian.sources; \
    fi \
  && apt-get update -o Acquire::Retries=5 -o Acquire::ForceIPv4=true \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

RUN if [ -f package-lock.json ]; then npm ci --omit=dev --no-audit --no-fund; else npm install --omit=dev --no-audit --no-fund; fi \
  && npm rebuild sqlite3 --build-from-source

FROM node:24-bookworm-slim

ENV NODE_ENV=production \
    DATA_DIR=/app/data \
    API_PORT=22102

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 22102

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.API_PORT || 22102}/api/health`).then((res) => { process.exit(res.ok ? 0 : 1); }).catch(() => process.exit(1));"]

CMD ["node", "src/index.js"]
