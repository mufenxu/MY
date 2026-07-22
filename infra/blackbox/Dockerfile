ARG NODE_IMAGE=node:24-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d
FROM ${NODE_IMAGE}

ENV NODE_ENV=production \
    PLATFORM_BLACKBOX_SPOOL_FILE=/state/blackbox-spool.jsonl

WORKDIR /app
COPY --chown=node:node scripts/platform-blackbox-probe.mjs ./scripts/platform-blackbox-probe.mjs
RUN mkdir -p /state && chown node:node /state

USER node
VOLUME ["/state"]
CMD ["node", "scripts/platform-blackbox-probe.mjs"]
