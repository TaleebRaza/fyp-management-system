#!/bin/bash
set -euo pipefail

if [[ ! ${MONGODB_REPLICA_SET_KEY:-} =~ ^[A-Za-z0-9+/=]{6,1024}$ ]]; then
  echo 'MONGODB_REPLICA_SET_KEY must be a 6-1024 character base64 value.' >&2
  exit 1
fi

key_file=/tmp/mongodb-replica-set.key
if [[ -f $key_file ]]; then
  if ! cmp -s <(printf '%s' "$MONGODB_REPLICA_SET_KEY") "$key_file"; then
    echo 'MONGODB_REPLICA_SET_KEY cannot change after MongoDB has started.' >&2
    exit 1
  fi
else
  umask 077
  printf '%s' "$MONGODB_REPLICA_SET_KEY" > "$key_file"
  chown mongodb:mongodb "$key_file"
fi

exec /usr/local/bin/docker-entrypoint.sh "$@"
