#!/bin/bash
#
# Varv Office Automation — install helper for macOS.
#
# Usage:
#   1. Drag this file to Terminal (or right-click → Open with → Terminal)
#   2. Enter your Mac password when prompted
#   3. Done — the app launches automatically
#
# What it does:
#   - Removes Apple's quarantine attribute (which blocks unsigned apps)
#   - Restores execute permission on the binary (Telegram/AirDrop sometimes strips it)
#   - Re-applies an ad-hoc code signature so Gatekeeper accepts it locally
#   - Launches the app
#
# Safe to re-run any time.

set -e

APP_PATH="/Applications/Varv Office Automation.app"

echo "→ Looking for $APP_PATH"
if [ ! -d "$APP_PATH" ]; then
  echo "❌ Application not found at $APP_PATH"
  echo "   Please drag 'Varv Office Automation.app' into the Applications"
  echo "   folder first, then run this script again."
  read -n 1 -s -r -p "Press any key to close..."
  exit 1
fi

echo "→ Removing quarantine attribute (requires password)"
sudo xattr -dr com.apple.quarantine "$APP_PATH"

echo "→ Restoring executable permissions"
sudo chmod -R +x "$APP_PATH"

echo "→ Applying ad-hoc code signature"
sudo codesign --force --deep --sign - "$APP_PATH" 2>/dev/null || true

echo "→ Launching application"
open "$APP_PATH"

echo ""
echo "✅ Done. The app should now be open."
echo "   For future launches, just double-click it from Applications."
echo ""
read -n 1 -s -r -p "Press any key to close this window..."
