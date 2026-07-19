#!/bin/bash
set -euo pipefail

mongo_admin() {
  mongosh --quiet --host="${MONGO_HOST:-mongodb}" --port=27017 \
    --username="$MONGO_INITDB_ROOT_USERNAME" \
    --password="$MONGO_INITDB_ROOT_PASSWORD" \
    --authenticationDatabase=admin "$@"
}

for attempt in $(seq 1 90); do
  if mongo_admin --eval "db.adminCommand('ping').ok" >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 90 ]; then
    echo "MongoDB did not become available" >&2
    exit 1
  fi
  sleep 2
done

if ! mongo_admin --eval "rs.status().ok" >/dev/null 2>&1; then
  mongo_admin --eval "rs.initiate({_id:'rs0',members:[{_id:0,host:'mongodb:27017'}]})"
fi

for attempt in $(seq 1 60); do
  if mongo_admin --eval "if (!db.hello().isWritablePrimary) quit(1)" >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 60 ]; then
    echo "MongoDB replica set did not elect a primary" >&2
    exit 1
  fi
  sleep 2
done

mongo_admin /opt/my-platform/ensure-users.js
echo "MongoDB replica set and application users are ready"
