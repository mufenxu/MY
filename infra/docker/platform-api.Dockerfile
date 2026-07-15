# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS admin-console-build
WORKDIR /build/admin-console
COPY apps/admin-console/package*.json ./
RUN npm ci --no-audit --no-fund
COPY apps/admin-console/ ./
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM ${NODE_IMAGE} AS core-admin-build
WORKDIR /build/core-admin
COPY apps/core-admin/package*.json ./
RUN npm ci --no-audit --no-fund
COPY apps/core-admin/ ./
RUN npm run build

FROM ${NODE_IMAGE} AS exam-admin-build
WORKDIR /build/exam-admin
COPY apps/exam-admin/package*.json ./
RUN npm ci --no-audit --no-fund
COPY apps/exam-admin/ ./
RUN npm run build

FROM ${NODE_IMAGE} AS platform-api-deps
WORKDIR /build/platform-api
COPY services/platform-api/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM ${NODE_IMAGE} AS core-api-deps
WORKDIR /build/core-api
COPY services/core-api/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM ${NODE_IMAGE} AS exam-api-deps
WORKDIR /build/exam-api
COPY services/exam-api/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM ${NODE_IMAGE} AS notification-deps
WORKDIR /build/notification-service
COPY services/notification-service/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    PLATFORM_API_HOST=0.0.0.0 \
    PLATFORM_API_PORT=22100 \
    PLATFORM_CONFIG_PATH=/app/config/platform.services.docker.json

WORKDIR /app

COPY --chown=node:node services/platform-api/ ./services/platform-api/
COPY --from=platform-api-deps --chown=node:node /build/platform-api/node_modules ./services/platform-api/node_modules

COPY --chown=node:node services/core-api/ ./services/core-api/
COPY --from=core-api-deps --chown=node:node /build/core-api/node_modules ./services/core-api/node_modules
COPY --from=core-admin-build --chown=node:node /build/core-admin/dist ./apps/core-admin/dist

COPY --chown=node:node services/exam-api/ ./services/exam-api/
COPY --from=exam-api-deps --chown=node:node /build/exam-api/node_modules ./services/exam-api/node_modules
COPY --from=exam-admin-build --chown=node:node /build/exam-admin/dist ./services/exam-api/frontend/dist

COPY --chown=node:node services/notification-service/ ./services/notification-service/
COPY --from=notification-deps --chown=node:node /build/notification-service/node_modules ./services/notification-service/node_modules

COPY --chown=node:node apps/admin-console/src ./apps/admin-console/src
COPY --chown=node:node apps/admin-console/package.json ./apps/admin-console/package.json
COPY --from=admin-console-build --chown=node:node /build/admin-console/node_modules ./apps/admin-console/node_modules
COPY --from=admin-console-build --chown=node:node /build/admin-console/dist ./apps/admin-console/dist
COPY --chown=node:node config/platform.services.docker.json ./config/platform.services.docker.json

RUN mkdir -p /app/services/core-api/uploads /app/services/core-api/logs \
    && chown -R node:node /app

USER node
WORKDIR /app/services/platform-api
EXPOSE 22100

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:22100/api/health').then((res) => process.exit(res.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "src/server.mjs"]
