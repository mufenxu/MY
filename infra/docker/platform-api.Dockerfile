# syntax=docker/dockerfile:1.7.1@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e

ARG NODE_IMAGE=node:24-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d

FROM ${NODE_IMAGE} AS admin-console-build
WORKDIR /build/apps/admin-console
COPY packages/platform-auth/ /build/packages/platform-auth/
COPY apps/admin-console/package*.json ./
RUN npm ci --no-audit --no-fund
COPY apps/admin-console/ ./
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM ${NODE_IMAGE} AS official-website-build
WORKDIR /build/apps/official-website
COPY apps/official-website/package*.json ./
RUN npm ci --no-audit --no-fund
COPY apps/official-website/ ./
RUN npm run build

FROM ${NODE_IMAGE} AS platform-api-deps
WORKDIR /build/services/platform-api
COPY packages/platform-auth/ /build/packages/platform-auth/
COPY services/platform-api/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM ${NODE_IMAGE} AS core-admin-build
WORKDIR /build/apps/core-admin
COPY packages/platform-browser-runtime/ /build/packages/platform-browser-runtime/
COPY apps/core-admin/package*.json ./
RUN npm ci --no-audit --no-fund
COPY apps/core-admin/ ./
RUN npm run build

FROM ${NODE_IMAGE} AS exam-admin-build
WORKDIR /build/apps/exam-admin
COPY packages/platform-browser-runtime/ /build/packages/platform-browser-runtime/
COPY apps/exam-admin/package*.json ./
RUN npm ci --no-audit --no-fund
COPY apps/exam-admin/ ./
RUN npm run build

FROM ${NODE_IMAGE} AS core-api-deps
WORKDIR /build/services/core-api
COPY packages/platform-auth/ /build/packages/platform-auth/
COPY services/core-api/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM ${NODE_IMAGE} AS exam-api-deps
WORKDIR /build/services/exam-api
COPY packages/platform-auth/ /build/packages/platform-auth/
COPY services/exam-api/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM ${NODE_IMAGE} AS runtime
ARG BUILD_REVISION=unknown
ARG BUILD_TIMESTAMP=
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgssapi-krb5-2 \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PLATFORM_EXTERNAL_SERVICES=false \
    PLATFORM_API_HOST=0.0.0.0 \
    PLATFORM_API_PORT=22100 \
    CORE_PORT=3045 \
    CORE_ADMIN_DIST=/app/apps/core-admin/dist \
    PORT=3110 \
    PLATFORM_CONFIG_PATH=/app/config/platform.services.docker.json \
    PLATFORM_RELEASE_REVISION=${BUILD_REVISION} \
    PLATFORM_RELEASE_DEPLOYED_AT=${BUILD_TIMESTAMP}

WORKDIR /app
COPY --chown=node:node packages/platform-auth/ ./packages/platform-auth/
COPY --chown=node:node services/platform-api/ ./services/platform-api/
COPY --from=platform-api-deps --chown=node:node /build/services/platform-api/node_modules ./services/platform-api/node_modules
COPY --chown=node:node services/core-api/ ./services/core-api/
COPY --from=core-api-deps --chown=node:node /build/services/core-api/node_modules ./services/core-api/node_modules
COPY --from=core-admin-build --chown=node:node /build/apps/core-admin/dist ./apps/core-admin/dist
COPY --chown=node:node services/exam-api/ ./services/exam-api/
COPY --from=exam-api-deps --chown=node:node /build/services/exam-api/node_modules ./services/exam-api/node_modules
COPY --from=exam-admin-build --chown=node:node /build/apps/exam-admin/dist ./services/exam-api/frontend/dist
COPY --chown=node:node apps/admin-console/src ./apps/admin-console/src
COPY --chown=node:node apps/admin-console/scripts ./apps/admin-console/scripts
COPY --chown=node:node apps/admin-console/package.json ./apps/admin-console/package.json
COPY --from=admin-console-build --chown=node:node /build/apps/admin-console/node_modules ./apps/admin-console/node_modules
COPY --from=admin-console-build --chown=node:node /build/apps/admin-console/dist ./apps/admin-console/dist
COPY --from=official-website-build --chown=node:node /build/apps/official-website/dist ./apps/official-website/dist
COPY --chown=node:node config/platform.services.docker.json ./config/platform.services.docker.json

RUN mkdir -p /app/services/core-api/uploads /app/services/core-api/logs \
    && chown -R node:node /app

USER node
WORKDIR /app/services/platform-api
EXPOSE 22100

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:22100/api/readyz').then((res) => process.exit(res.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "src/server.mjs"]
