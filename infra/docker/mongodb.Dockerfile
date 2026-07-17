# syntax=docker/dockerfile:1.7

ARG MONGODB_BASE_IMAGE=mongo:7.0
FROM ${MONGODB_BASE_IMAGE}

COPY mongodb-entrypoint.sh /usr/local/bin/my-mongodb-entrypoint
COPY mongo-init.sh /usr/local/bin/my-mongo-init
COPY ensure-users.js /opt/my-platform/ensure-users.js
RUN chmod 755 /usr/local/bin/my-mongodb-entrypoint /usr/local/bin/my-mongo-init

USER mongodb

ENTRYPOINT ["/usr/local/bin/my-mongodb-entrypoint"]
CMD ["mongod", "--bind_ip_all", "--replSet", "rs0"]
