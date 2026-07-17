FROM node:24-bookworm-slim AS deps

WORKDIR /app
COPY vendor/platform-auth/ ./packages/platform-auth/
WORKDIR /app/services/iot-service
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
  && npm cache clean --force

FROM node:24-bookworm-slim

ENV NODE_ENV=production \
    API_PORT=22102

WORKDIR /app
COPY --chown=node:node vendor/platform-auth/ ./packages/platform-auth/
WORKDIR /app/services/iot-service
COPY --from=deps /app/services/iot-service/node_modules ./node_modules
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public
COPY --chown=node:node package.json ./package.json

USER node
EXPOSE 22102
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.API_PORT || 22102}/api/ready`).then((res) => process.exit(res.ok ? 0 : 1)).catch(() => process.exit(1));"]

CMD ["node", "src/index.js"]
