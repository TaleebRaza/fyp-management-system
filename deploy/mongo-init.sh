#!/bin/bash
set -euo pipefail

exec mongosh --host mongo \
  --username "$MONGODB_ROOT_USERNAME" \
  --password "$MONGODB_ROOT_PASSWORD" \
  --authenticationDatabase admin \
  /scripts/mongo-init.js
