FROM node:24-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS deps

WORKDIR /app
COPY packages/platform-auth/ ./packages/platform-auth/
WORKDIR /app/services/iot-service
COPY services/iot-service/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
  && npm cache clean --force

FROM node:24-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d

ENV NODE_ENV=production \
    API_PORT=22102

WORKDIR /app
COPY --chown=node:node packages/platform-auth/ ./packages/platform-auth/
WORKDIR /app/services/iot-service
COPY --from=deps /app/services/iot-service/node_modules ./node_modules
COPY --chown=node:node services/iot-service/src ./src
COPY --chown=node:node services/iot-service/public ./public
COPY --chown=node:node services/iot-service/package.json ./package.json

USER node
EXPOSE 22102
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.API_PORT || 22102}/api/ready`).then((res) => process.exit(res.ok ? 0 : 1)).catch(() => process.exit(1));"]

CMD ["node", "src/index.js"]
