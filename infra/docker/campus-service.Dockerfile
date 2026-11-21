FROM node:26-bookworm-slim@sha256:5df79989ed685e09f0a98019db4cebfb22fb9df1a53c0161664a011f7ff6b0f1

ENV NODE_ENV=production \
    PORT=22101 \
    HGU_HOST=0.0.0.0 \
    NODE_EXTRA_CA_CERTS=/etc/ssl/certs/digicert-basic-ov-g2-tls-cn-rsa4096-sha256-2022-ca1.pem

WORKDIR /app
COPY packages/platform-auth/ ./packages/platform-auth/
COPY packages/api-contract/ ./packages/api-contract/
WORKDIR /app/services/campus-service
COPY services/campus-service/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
  && npm cache clean --force

COPY --chown=node:node services/campus-service/server.js ./
COPY --chown=node:node services/campus-service/src ./src
COPY --chown=node:node services/campus-service/scripts ./scripts
COPY --chown=node:node services/campus-service/public ./public
COPY infra/docker/certs/digicert-basic-ov-g2-tls-cn-rsa4096-sha256-2022-ca1.pem /etc/ssl/certs/digicert-basic-ov-g2-tls-cn-rsa4096-sha256-2022-ca1.pem

USER node
EXPOSE 22101
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:22101/readyz').then((res) => process.exit(res.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "server.js"]
