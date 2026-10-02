#!/usr/bin/env bash
# Headless screenshot of the running dev server (http://localhost:5173).
# usage: scripts/shot.sh <name> "<hash>" [virtual_time_ms=9000] [W,H=1600,900]
#        scripts/shot.sh <name> "<hash>" [ms] phone            -> 412x915 portrait phone (real phone media queries)
#        scripts/shot.sh <name> "<hash>" [ms] phone:915,412    -> any phone size, e.g. landscape
#   <hash> e.g. "view=system&tab=system&speed=3600&t=2038-11-03"  (see src/main.tsx; DEV-only: js=<code>)
# Output: .shots/<name>.png  (git-ignored; open it with the Read tool to look at it)
NAME=${1:?name}; HASH=${2:-}; MS=${3:-9000}; SIZE=${4:-1600,900}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; OUT="$ROOT/.shots/$NAME.png"; mkdir -p "$ROOT/.shots"
URL="http://localhost:5173/#$HASH"
if [[ "$SIZE" == phone* ]]; then
  P=${SIZE#phone}; P=${P#:}; P=${P:-412,915}; W=${P%,*}; H=${P#*,}
  URL="http://localhost:5173/scripts/phone.html?w=$W&h=$H#$HASH"
  SIZE="$(( W < 500 ? 500 : W )),$H"   # headless Edge cannot go narrower than ~500 px; the iframe keeps the real width
fi
"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu-sandbox --use-gl=angle --use-angle=swiftshader \
  --enable-unsafe-swiftshader --hide-scrollbars --user-data-dir="$TEMP/edge-shot-$NAME" --window-size=$SIZE --virtual-time-budget=$MS \
  --screenshot="$OUT" "$URL" 2>&1 | grep -E "bytes written|Page load failed"
rm -rf "$TEMP/edge-shot-$NAME"
echo "$OUT"
