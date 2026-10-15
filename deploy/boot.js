const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { pipeline } = require("stream/promises");
const { spawn, execFileSync } = require("child_process");

const PORT = Number(process.env.PORT || 8080);
const TOKEN = process.env.DEPLOY_TOKEN;
const DEPLOYMENT = (process.env.RAILWAY_DEPLOYMENT_ID || "local").slice(0, 8);
const WORK = path.join(os.tmpdir(), "subletka");
const RELEASES = path.join(WORK, "releases");
const APP_PORTS = [3001, 3002];
const READY_PATH = "/pl";
const READY_TIMEOUT_MS = 180_000;
const DRAIN_MS = 30_000;
const KILL_AFTER_MS = 10_000;
const KEEP = 3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...args) => console.log("boot:", ...args);

const bucket = {
  host: `${process.env.RELEASE_BUCKET}.${new URL(process.env.RELEASE_BUCKET_ENDPOINT || "https://invalid").host}`,
  key: process.env.RELEASE_BUCKET_ACCESS_KEY_ID,
  secret: process.env.RELEASE_BUCKET_SECRET_ACCESS_KEY,
  region: process.env.RELEASE_BUCKET_REGION || "auto",
  prefix: process.env.RELEASE_PREFIX || "",
};

const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");
const hmac = (key, data) => crypto.createHmac("sha256", key).update(data).digest();

async function s3(method, key, body) {
  const pathname = "/" + (bucket.prefix + key).split("/").map(encodeURIComponent).join("/");
  const amzDate = new Date().toISOString().replace(/[-:]|\.\d{3}/g, "");
  const day = amzDate.slice(0, 8);
  const scope = `${day}/${bucket.region}/s3/aws4_request`;
  const headers = { host: bucket.host, "x-amz-content-sha256": sha256(body ?? ""), "x-amz-date": amzDate };
  const names = Object.keys(headers).sort();
  const canonical = [method, pathname, "", names.map((h) => `${h}:${headers[h]}\n`).join(""), names.join(";"), headers["x-amz-content-sha256"]].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
  const signingKey = ["s3", "aws4_request"].reduce(hmac, hmac(hmac(`AWS4${bucket.secret}`, day), bucket.region));
  const signature = crypto.createHmac("sha256", signingKey).update(toSign).digest("hex");
  const { host, ...sent } = headers;
  const res = await fetch(`https://${host}${pathname}`, {
    method,
    body,
    headers: { ...sent, authorization: `AWS4-HMAC-SHA256 Credential=${bucket.key}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}` },
  });
  if (method === "GET" && res.status === 404) return null;
  if (!res.ok) {
    const code = (await res.text()).match(/<Code>([^<]+)<\/Code>/)?.[1] ?? "";
    throw new Error(`bucket ${method} ${key} failed with ${res.status} ${code}`);
  }
  return method === "GET" ? Buffer.from(await res.arrayBuffer()) : null;
}

const readState = async () => {
  const raw = await s3("GET", "releases.json");
  return raw ? JSON.parse(raw.toString("utf8")) : null;
};

async function record(id) {
  const prior = (await readState())?.history ?? [];
  const history = [id, ...prior.filter((r) => r !== id)];
  await s3("PUT", "releases.json", Buffer.from(JSON.stringify({ current: id, history: history.slice(0, KEEP) })));
  for (const r of history.slice(KEEP)) await s3("DELETE", `releases/${r}.tgz`).catch((e) => log(e.message));
  for (const dir of fs.readdirSync(RELEASES)) {
    if (!history.slice(0, KEEP).includes(dir)) fs.rmSync(path.join(RELEASES, dir), { recursive: true, force: true });
  }
}

function unpack(id, tgz) {
  const dir = path.join(RELEASES, id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  execFileSync("tar", ["xzf", tgz, "-C", dir]);
  fs.rmSync(tgz);
}

async function fetchRelease(id) {
  if (fs.existsSync(path.join(RELEASES, id, "server.js"))) return;
  const body = await s3("GET", `releases/${id}.tgz`);
  if (!body) throw new Error(`release ${id} is not in the bucket`);
  const tgz = path.join(WORK, `fetch-${id}.tgz`);
  fs.writeFileSync(tgz, body);
  unpack(id, tgz);
}

let active = null;
let retiring = Promise.resolve();
let queue = Promise.resolve();
const enqueue = (job) => (queue = queue.then(job, job));

function startChild(id, port) {
  const child = { id, port, inflight: 0, exited: false };
  child.proc = spawn("node", ["server.js"], {
    cwd: path.join(RELEASES, id),
    stdio: "inherit",
    env: { ...process.env, PORT: String(port), HOSTNAME: "127.0.0.1" },
  });
  child.proc.on("exit", (code, signal) => {
    child.exited = true;
    log("app exited", id, port, code ?? signal);
    if (active === child) recover(id);
  });
  return child;
}

const probe = (port) =>
  new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port, path: READY_PATH, timeout: 15_000 }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(0));
  });

async function ready(child) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exited) throw new Error(`release ${child.id} exited before it was ready`);
    if ((await probe(child.port)) === 200) return;
    await sleep(250);
  }
  throw new Error(`release ${child.id} was not ready within ${READY_TIMEOUT_MS / 1000} s`);
}

function stop(child) {
  if (child.exited) return Promise.resolve();
  return new Promise((resolve) => {
    const kill = setTimeout(() => child.proc.kill("SIGKILL"), KILL_AFTER_MS);
    child.proc.once("exit", () => {
      clearTimeout(kill);
      resolve();
    });
    child.proc.kill("SIGTERM");
  });
}

async function retire(child) {
  const deadline = Date.now() + DRAIN_MS;
  while (child.inflight > 0 && Date.now() < deadline) await sleep(100);
  await stop(child);
  log("retired", child.id, "from", child.port);
}

async function activate(id) {
  await retiring;
  const port = active?.port === APP_PORTS[0] ? APP_PORTS[1] : APP_PORTS[0];
  log("starting", id, "on", port);
  const next = startChild(id, port);
  try {
    await ready(next);
  } catch (e) {
    await stop(next);
    throw e;
  }
  const old = active;
  active = next;
  log("serving", id, "on", port);
  if (old) retiring = retire(old);
}

function recover(id) {
  enqueue(() => (active?.exited ? activate(id) : undefined)).catch((e) => {
    log("recovery failed:", e.message);
    setTimeout(() => recover(id), 2000);
  });
}

const authorized = (req) => {
  if (!TOKEN || typeof req.headers.authorization !== "string") return false;
  const given = Buffer.from(req.headers.authorization);
  const expected = Buffer.from(`Bearer ${TOKEN}`);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
};

async function deploy(req) {
  const id = new Date().toISOString().replace(/[:.]/g, "-");
  const tgz = path.join(WORK, `upload-${id}.tgz`);
  await pipeline(req, fs.createWriteStream(tgz));
  const body = fs.readFileSync(tgz);
  unpack(id, tgz);
  await enqueue(async () => {
    await s3("PUT", `releases/${id}.tgz`, body);
    try {
      await activate(id);
    } catch (e) {
      await s3("DELETE", `releases/${id}.tgz`).catch(() => {});
      throw e;
    }
    await record(id);
  });
  return `deployed ${id}\n`;
}

async function rollback(req) {
  const wanted = new URL(req.url, "http://boot").searchParams.get("release");
  const history = (await readState())?.history ?? [];
  const id = wanted ?? history.find((r) => r !== active?.id);
  if (!id || !history.includes(id)) throw Object.assign(new Error("no such release to roll back to\n"), { status: 409 });
  await enqueue(async () => {
    await fetchRelease(id);
    await activate(id);
    await record(id);
  });
  return `serving ${id}\n`;
}

function admin(handler, req, res) {
  if (!authorized(req)) return res.writeHead(401).end("unauthorized\n");
  handler(req, res).then(
    (text) => res.writeHead(200).end(text),
    (e) => {
      log("admin request failed:", e.message);
      res.writeHead(e.status ?? 500).end(`${e.message.trim()}\n`);
    },
  );
}

function proxy(req, res, attempt = 0) {
  const target = active;
  if (!target) {
    res.writeHead(503, { "retry-after": "5" }).end("starting\n");
    return;
  }
  target.inflight++;
  let counted = true;
  const done = () => {
    if (counted) target.inflight--;
    counted = false;
  };
  res.once("close", done);
  const upstream = http.request(
    { host: "127.0.0.1", port: target.port, method: req.method, path: req.url, headers: req.headers },
    (up) => {
      res.writeHead(up.statusCode, { ...up.headers, "x-release": target.id, "x-deployment": DEPLOYMENT });
      up.pipe(res);
    },
  );
  upstream.on("error", () => {
    done();
    res.removeListener("close", done);
    if (attempt < 20 && !res.headersSent && (req.method === "GET" || req.method === "HEAD")) {
      setTimeout(() => proxy(req, res, attempt + 1), 250);
    } else if (!res.headersSent) {
      res.writeHead(502).end("bad gateway\n");
    }
  });
  if (attempt === 0) req.pipe(upstream);
  else upstream.end();
}

const server = http.createServer((req, res) => {
  if (req.url === "/__deploy" && req.method === "PUT") return admin(deploy, req, res);
  if (req.url.startsWith("/__rollback") && req.method === "POST") return admin(rollback, req, res);
  if (req.url === "/__boot") {
    const live = active && !active.exited;
    return res.writeHead(live ? 200 : 503, { "cache-control": "no-store" }).end(live ? `${active.id}\n` : "starting\n");
  }
  proxy(req, res);
});

process.on("SIGTERM", async () => {
  log("SIGTERM, draining");
  await sleep(3000);
  server.close();
  server.closeIdleConnections();
  const deadline = Date.now() + DRAIN_MS;
  while (active && active.inflight > 0 && Date.now() < deadline) await sleep(100);
  await Promise.all([active && stop(active), retiring]);
  process.exit(0);
});

fs.mkdirSync(RELEASES, { recursive: true });
server.listen(PORT, "::", () => log("listening", PORT));

(async () => {
  const state = await readState();
  if (!state) return log("no release recorded yet");
  await fetchRelease(state.current);
  await enqueue(() => activate(state.current));
})().catch((e) => {
  log("could not start the current release:", e.message);
  process.exit(1);
});
