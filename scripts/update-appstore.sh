#!/usr/bin/env bash
# Usage: scripts/update-appstore.sh v1.2.3 path/to/appstore
# Points Apps/Flyto in the store checkout at a release.
set -euo pipefail

TAG=$1
COMPOSE=$2/Apps/Flyto/docker-compose.yml
VERSION=${TAG#v}
DATE=$(date -u +%Y-%m-%d)

if [[ ! $TAG =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Not a stable release tag: $TAG" >&2
  exit 1
fi

perl -pi -e "
  s{(image: ghcr\.io/arayan48/flyto:)\S+}{\${1}$TAG};
  s{^(  version: )\"[^\"]*\"}{\${1}\"$VERSION\"};
  s{^(  update_at: )\"[^\"]*\"}{\${1}\"$DATE\"};
  s{(flyto/releases/tag/)\S+}{\${1}$TAG};
" "$COMPOSE"

grep -q "flyto:$TAG" "$COMPOSE"
grep -q "version: \"$VERSION\"" "$COMPOSE"
