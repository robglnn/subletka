import { spawn } from "node:child_process";

const base = process.argv[2] ?? "http://localhost:8090";
const shipCwd = process.argv[3] ?? process.cwd();
const workers = Number(process.env.WORKERS ?? 16);

const buildOf = (body) => body.match(/\\?"b\\?":\\?"([A-Za-z0-9_-]+)/)?.[1] ?? "none";
const samples = [];
let running = true;

const loop = async () => {
  while (running) {
    const t = Date.now();
    try {
      const res = await fetch(`${base}/en/about`);
      samples.push({ t, status: res.status, build: buildOf(await res.text()) });
    } catch {
      samples.push({ t, status: 0, build: "error" });
    }
  }
};

const before = buildOf(await (await fetch(`${base}/en/about`)).text());
const loops = Array.from({ length: workers }, loop);
const ship = spawn("./deploy/ship.sh", { cwd: shipCwd, stdio: "ignore", env: process.env });
await new Promise((resolve) => ship.on("exit", resolve));
await new Promise((resolve) => setTimeout(resolve, 5000));
running = false;
await Promise.all(loops);

samples.sort((a, b) => a.t - b.t);
const firstNew = samples.findIndex((s) => s.build !== before && s.status === 200);
const after = samples.slice(firstNew);
const stale = after.filter((s) => s.build === before).length;
const errors = samples.filter((s) => s.status !== 200).length;
const counts = samples.reduce((m, s) => ({ ...m, [`${s.status} ${s.build}`]: (m[`${s.status} ${s.build}`] ?? 0) + 1 }), {});
console.log({ before, samples: samples.length, counts, stale_after_first_new: stale, non_200: errors });
process.exit(firstNew >= 0 && stale === 0 ? 0 : 1);
