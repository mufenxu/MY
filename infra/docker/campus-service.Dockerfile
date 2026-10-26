FROM node:26-bookworm-slim@sha256:28147155d47dc31abe0a46e0d12b59b2fb3d0a2dcc5dc65fce76a074180b16fe

ENV NODE_ENV=production \
    PORT=22101 \
    HGU_HOST=0.0.0.0 \
    NODE_EXTRA_CA_CERTS=/etc/ssl/certs/digicert-basic-ov-g2-tls-cn-rsa4096-sha256-2022-ca1.pem

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
COPY infra/docker/certs/digicert-basic-ov-g2-tls-cn-rsa4096-sha256-2022-ca1.pem /etc/ssl/certs/digicert-basic-ov-g2-tls-cn-rsa4096-sha256-2022-ca1.pem

USER node
EXPOSE 22101
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:22101/api/ready').then((res) => process.exit(res.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "server.js"]
