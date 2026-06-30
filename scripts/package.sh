#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${1:-$ROOT_DIR/../output/3cx-monitor}"
mkdir -p "$OUTPUT_DIR"

tar \
  --exclude='.env' \
  --exclude='.env.local' \
  --exclude='.env.production' \
  --exclude='.env.development' \
  --exclude='.venv' \
  --exclude='__pycache__' \
  --exclude='*.pyc' \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='data' \
  --exclude='*.tsbuildinfo' \
  --exclude='*.tar.gz' \
  -czf "$OUTPUT_DIR/3cx-monitor.tar.gz" \
  -C "$(dirname "$ROOT_DIR")" \
  "$(basename "$ROOT_DIR")"

echo "$OUTPUT_DIR/3cx-monitor.tar.gz"
