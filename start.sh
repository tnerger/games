#!/data/data/com.termux/files/usr/bin/bash
set -e
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then npm install; fi
exec npm start
