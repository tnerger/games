#!/data/data/com.termux/files/usr/bin/bash
set -e
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then npm install; fi
mkdir -p data
if [ ! -s data/admin-token ]; then
  node -e "process.stdout.write(require('crypto').randomBytes(24).toString('hex')+'\n')" > data/admin-token
  chmod 600 data/admin-token
fi
echo ""
echo "Admin-Schlüssel (nur für dich; nicht weitergeben):"
cat data/admin-token
echo ""
while true; do
  set +e
  node server.js
  result=$?
  set -e
  if [ "$result" -eq 42 ]; then
    echo "Update abgeschlossen, Server startet neu..."
    continue
  fi
  exit "$result"
done
