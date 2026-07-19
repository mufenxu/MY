# syntax=docker/dockerfile:1.7

ARG DOCKER_CLI_IMAGE=docker:27.5.1-cli
FROM ${DOCKER_CLI_IMAGE}

RUN apk add --no-cache nodejs \
    && addgroup -S -g 10001 runner \
    && adduser -S -D -H -u 10001 -G runner runner \
    && mkdir -p /app /state /home/runner/.docker \
    && chown -R runner:runner /app /state /home/runner \
    && node -e "if (Number(process.versions.node.split('.')[0]) < 20) process.exit(1)" \
    && docker compose version

WORKDIR /app
COPY scripts/deployment-runner.mjs ./scripts/deployment-runner.mjs

ENV NODE_ENV=production \
    DEPLOY_RUNNER_HOST=0.0.0.0 \
    DEPLOY_RUNNER_PORT=22104

EXPOSE 22104

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:22104/healthz').then((res) => process.exit(res.ok ? 0 : 1)).catch(() => process.exit(1))"]

USER runner

CMD ["node", "/app/scripts/deployment-runner.mjs"]
