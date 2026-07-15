FROM node:22-alpine AS runtime

WORKDIR /app
COPY package*.json ./
RUN apk add --no-cache su-exec \
  && npm ci --omit=dev \
  && npm cache clean --force

COPY --chown=node:node server.js ./
COPY --chown=node:node src ./src
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node public ./public
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN mkdir -p /app/data && chown node:node /app/data
RUN chmod 755 /usr/local/bin/docker-entrypoint.sh

ENV NODE_ENV=production
ENV PORT=8780
ENV HGU_HOST=0.0.0.0

EXPOSE 8780
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD su-exec node wget -q -O - http://127.0.0.1:8780/api/ready >/dev/null || exit 1
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server.js"]
