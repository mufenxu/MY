#!/bin/bash
set -euo pipefail

if [ -z "${MONGO_REPLICA_SET_KEY:-}" ]; then
  echo "MONGO_REPLICA_SET_KEY is required" >&2
  exit 1
fi

key_file=/tmp/my-platform-mongodb-keyfile
umask 077
printf '%s' "$MONGO_REPLICA_SET_KEY" > "$key_file"
chown mongodb:mongodb "$key_file"
chmod 400 "$key_file"

exec /usr/local/bin/docker-entrypoint.sh "$@" --keyFile "$key_file"
