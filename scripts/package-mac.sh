#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "[1/4] Installing dependencies"
npm install

echo "[2/4] Building app"
npm run build

echo "[3/4] Packaging for macOS (.dmg + .zip)"
npx electron-builder --mac dmg zip --publish never

echo "[4/4] Done. Artifacts are in: $(pwd)/release"
