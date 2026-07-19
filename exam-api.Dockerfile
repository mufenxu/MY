# syntax=docker/dockerfile:1.7.1@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e

ARG NODE_IMAGE=node:24-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d

FROM ${NODE_IMAGE} AS admin-build
WORKDIR /build/exam-admin
COPY apps/exam-admin/package*.json ./
RUN npm ci --no-audit --no-fund
COPY apps/exam-admin/ ./
RUN npm run build

FROM ${NODE_IMAGE} AS api-deps
WORKDIR /build/services/exam-api
COPY packages/platform-auth/ /build/packages/platform-auth/
COPY services/exam-api/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    PORT=3110

WORKDIR /app
COPY --chown=node:node packages/platform-auth/ ./packages/platform-auth/
COPY --chown=node:node services/exam-api/ ./services/exam-api/
COPY --from=api-deps --chown=node:node /build/services/exam-api/node_modules ./services/exam-api/node_modules
COPY --from=admin-build --chown=node:node /build/exam-admin/dist ./services/exam-api/frontend/dist

RUN chown -R node:node /app

USER node
WORKDIR /app/services/exam-api
EXPOSE 3110

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3110/ready').then((res) => process.exit(res.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "src/server.js"]
