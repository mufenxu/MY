# syntax=docker/dockerfile:1.7.1@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e

ARG MONGODB_BASE_IMAGE=mongo:7.0@sha256:d5b3ca8c3f3cdce78d44870dc0871b76d5235e9b2ad4ea6bea5d1fbff8027703
FROM ${MONGODB_BASE_IMAGE}

COPY mongodb-entrypoint.sh /usr/local/bin/my-mongodb-entrypoint
COPY mongo-init.sh /usr/local/bin/my-mongo-init
COPY ensure-users.js /opt/my-platform/ensure-users.js
RUN chmod 755 /usr/local/bin/my-mongodb-entrypoint /usr/local/bin/my-mongo-init

USER mongodb

ENTRYPOINT ["/usr/local/bin/my-mongodb-entrypoint"]
CMD ["mongod", "--bind_ip_all", "--replSet", "rs0"]
