# syntax=docker/dockerfile:1.7.1@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e

ARG NODE_IMAGE=node:24-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d
ARG MONGODB_TOOLS_IMAGE=mongo:7.0@sha256:d5b3ca8c3f3cdce78d44870dc0871b76d5235e9b2ad4ea6bea5d1fbff8027703

FROM ${MONGODB_TOOLS_IMAGE} AS mongo-tools

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    BACKUP_RUNNER_HOST=0.0.0.0 \
    BACKUP_RUNNER_PORT=22103

WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgssapi-krb5-2 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=mongo-tools /usr/bin/mongodump /usr/bin/mongorestore /usr/local/bin/
COPY --chown=node:node apps/admin-console/package.json ./apps/admin-console/package.json
COPY --chown=node:node apps/admin-console/src/backups.js apps/admin-console/src/backupArchives.js ./apps/admin-console/src/
COPY --chown=node:node scripts/backup-runner.mjs scripts/backup-mongodb-container.mjs scripts/restore-mongodb-container.mjs ./scripts/

RUN mongodump --version >/dev/null \
    && mongorestore --version >/dev/null \
    && mkdir -p /app/backups /app/services/core-api/uploads \
    && chown -R node:node /app

USER node
EXPOSE 22103

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:22103/health').then((res) => process.exit(res.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "scripts/backup-runner.mjs"]
