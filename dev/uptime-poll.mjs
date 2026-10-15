import { appendFileSync, existsSync, rmSync, writeFileSync } from "node:fs";

const [url = "https://subletka.com/pl", out = "/tmp/uptime-poll.txt"] = process.argv.slice(2);
const INTERVAL_MS = Number(process.env.INTERVAL_MS ?? 200);
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS ?? 5000);
const STOP_FILE = process.env.STOP_FILE ?? `${out}.stop`;

writeFileSync(out, `# GET ${url} every ${INTERVAL_MS} ms, timeout ${TIMEOUT_MS} ms\n# iso_time status latency_ms deployment/release\n`);
const stats = { total: 0, ok: 0, failed: 0, timeouts: 0, maxLatency: 0 };
const inflight = new Set();

const probe = async () => {
  const started = Date.now();
  let line;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "manual", headers: { "cache-control": "no-cache" } });
    const body = await res.text();
    const latency = Date.now() - started;
    stats.maxLatency = Math.max(stats.maxLatency, latency);
    const ok = res.status === 200;
    stats[ok ? "ok" : "failed"]++;
    const release = `${res.headers.get("x-deployment") ?? "-"}/${res.headers.get("x-release") ?? "-"}`;
    line = `${new Date(started).toISOString()} ${res.status} ${latency} ${release}${ok ? "" : ` ${body.slice(0, 60).replace(/\s+/g, " ")}`}`;
  } catch (e) {
    const timeout = e.name === "TimeoutError";
    stats.failed++;
    if (timeout) stats.timeouts++;
    line = `${new Date(started).toISOString()} ${timeout ? "TIMEOUT" : "ERROR"} ${Date.now() - started} ${timeout ? "" : e.cause?.code ?? e.message}`;
  }
  stats.total++;
  appendFileSync(out, `${line}\n`);
};

rmSync(STOP_FILE, { force: true });
while (!existsSync(STOP_FILE)) {
  const p = probe().finally(() => inflight.delete(p));
  inflight.add(p);
  await new Promise((r) => setTimeout(r, INTERVAL_MS));
}
await Promise.all(inflight);
const summary = `# total=${stats.total} ok=${stats.ok} non_200_or_error=${stats.failed} timeouts=${stats.timeouts} max_latency_ms=${stats.maxLatency}`;
appendFileSync(out, `${summary}\n`);
console.log(summary);
