#!/usr/bin/env bash
set -euo pipefail

LH="${LH:-/tmp/qa/node_modules/.bin/lighthouse}"
OUT="${1:?out dir}"
BASE="${2:-https://subletka.com}"
RUNS="${RUNS:-3}"
mkdir -p "$OUT"
for i in $(seq 1 "$RUNS"); do
  for lang in pl en; do
    "$LH" "$BASE/$lang" --quiet --output=json --output-path="$OUT/$lang-$i.json" \
      --only-categories=performance --chrome-path=/usr/local/bin/google-chrome \
      --chrome-flags="--headless=new --no-sandbox" >/dev/null 2>&1
  done
done
node -e '
const fs = require("fs");
const dir = process.argv[1];
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
for (const lang of ["pl", "en"]) {
  const runs = fs.readdirSync(dir).filter((f) => f.startsWith(lang + "-")).map((f) => JSON.parse(fs.readFileSync(`${dir}/${f}`)));
  const m = (id) => runs.map((r) => r.audits[id].numericValue);
  const perf = runs.map((r) => Math.round(r.categories.performance.score * 100));
  const row = { perf: med(perf), perfRuns: perf.join("/"), lcp: Math.round(med(m("largest-contentful-paint"))), tbt: Math.round(med(m("total-blocking-time"))), cls: +med(m("cumulative-layout-shift")).toFixed(3), fcp: Math.round(med(m("first-contentful-paint"))), si: Math.round(med(m("speed-index"))), bytes: Math.round(med(m("total-byte-weight")) / 1024) + "KiB" };
  console.log(lang, JSON.stringify(row));
}' "$OUT"
