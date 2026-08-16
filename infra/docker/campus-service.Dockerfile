FROM node:24-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d

ENV NODE_ENV=production \
    PORT=22101 \
    HGU_HOST=0.0.0.0

WORKDIR /app
COPY packages/platform-auth/ ./packages/platform-auth/
WORKDIR /app/services/campus-service
COPY services/campus-service/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
  && npm cache clean --force

COPY --chown=node:node services/campus-service/server.js ./
COPY --chown=node:node services/campus-service/src ./src
COPY --chown=node:node services/campus-service/scripts ./scripts
COPY --chown=node:node services/campus-service/public ./public

USER node
EXPOSE 22101
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:22101/api/ready').then((res) => process.exit(res.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "server.js"]
