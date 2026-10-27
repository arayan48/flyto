#!/bin/sh
set -e

# Docker creates a missing bind mount source as root, the node user could not
# write to it: give the data folder to node, then drop root
if [ "$(id -u)" = "0" ]; then
  dir="${FLYTO_UPLOAD_DIR:-/data}"
  mkdir -p "$dir"
  if [ "$(stat -c %u "$dir")" != "$(id -u node)" ]; then
    chown -R node:node "$dir"
  fi
  exec su-exec node "$@"
fi

exec "$@"
