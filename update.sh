#!/data/data/com.termux/files/usr/bin/bash
set -e
cd "$(dirname "$0")"
if [ -n "$(git status --porcelain)" ]; then echo 'Lokale Änderungen vorhanden. Update abgebrochen.'; exit 1; fi
git fetch origin main
if [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ]; then echo 'Bereits aktuell.'; exit 0; fi
git pull --ff-only origin main
npm install --omit=dev
echo 'Update installiert. Server mit ./start.sh neu starten.'
