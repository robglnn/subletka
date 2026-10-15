#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
WORK="${TMPDIR:-/tmp}/archivo-subset"
OUT=src/app/fonts/archivo-pl.woff2
SRC_URL="https://github.com/google/fonts/raw/main/ofl/archivo/Archivo%5Bwdth%2Cwght%5D.ttf"
UNICODES="U+0020-007E,U+00A0-00FF,U+0104-0107,U+010C-010D,U+0118-011B,U+0141-0144,U+0158-0161,U+0179-017E,U+2013-2014,U+2018-201E,U+2022,U+2026,U+20AC,U+2190,U+2192,U+2212"

mkdir -p "$WORK" "$(dirname "$OUT")"
[ -x "$WORK/venv/bin/pyftsubset" ] || { python3 -m venv "$WORK/venv" && "$WORK/venv/bin/pip" install -q fonttools brotli; }
curl -fsSL "$SRC_URL" -o "$WORK/archivo.ttf"
"$WORK/venv/bin/fonttools" varLib.instancer "$WORK/archivo.ttf" wght=400:700 wdth=72:100 -o "$WORK/archivo-limited.ttf"
"$WORK/venv/bin/pyftsubset" "$WORK/archivo-limited.ttf" --unicodes="$UNICODES" --layout-features='kern,liga,calt,ccmp,locl,mark,mkmk' \
  --flavor=woff2 --output-file="$OUT"
ls -l "$OUT"
