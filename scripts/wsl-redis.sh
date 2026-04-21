#!/usr/bin/env bash
set -euo pipefail

REDIS_DIR="${REDIS_DIR:-/tmp/hots-redis}"
mkdir -p "$REDIS_DIR"
cd "$REDIS_DIR"

if [ ! -x "$REDIS_DIR/extract/usr/bin/redis-server" ]; then
  apt download redis-server redis-tools liblzf1 libjemalloc2
  mkdir -p extract
  for deb in *.deb; do
    dpkg-deb -x "$deb" extract
  done
fi

export LD_LIBRARY_PATH="$REDIS_DIR/extract/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
"$REDIS_DIR/extract/usr/bin/redis-server" --port "${REDIS_PORT:-6379}" --save '' --appendonly no --daemonize yes
"$REDIS_DIR/extract/usr/bin/redis-cli" -p "${REDIS_PORT:-6379}" ping
