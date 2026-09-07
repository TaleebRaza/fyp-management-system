#!/bin/sh
set -eu

case "${S3_ACCESS_KEY_ID:-}" in
  ''|*[!A-Za-z0-9]*) echo 'S3_ACCESS_KEY_ID must contain only letters and numbers.' >&2; exit 1 ;;
esac
case "${S3_SECRET_ACCESS_KEY:-}" in
  ''|*[!A-Za-z0-9/+=]*) echo 'S3_SECRET_ACCESS_KEY contains unsupported characters for local storage.' >&2; exit 1 ;;
esac
if [ "${S3_BUCKET_NAME:-}" != 'fyp-uploads' ]; then
  echo 'Local storage requires S3_BUCKET_NAME=fyp-uploads.' >&2
  exit 1
fi

until printf 'cluster.status\n' | weed shell -master=seaweedfs:9333 >/dev/null 2>&1; do
  sleep 1
done

printf 's3.configure -access_key=%s -secret_key=%s -buckets=%s -user=fyp-portal -actions=Read,Write,List,Tagging,Admin -apply\n' \
  "$S3_ACCESS_KEY_ID" "$S3_SECRET_ACCESS_KEY" "$S3_BUCKET_NAME" \
  | weed shell -master=seaweedfs:9333 >/dev/null
