import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "../app/api/mcp/route";
import { limited } from "./agent-http";
import { limiter } from "./rate-limit";

const handler = limited("mcp", async () => new Response("ok"));
const call = (headers: Record<string, string>) => handler(new Request("https://subletka.com/api/mcp", { method: "POST", headers }));

const burst = async (n: number, headers: (i: number) => Record<string, string>) => {
  const statuses: number[] = [];
  for (let i = 0; i < n; i++) statuses.push((await call(headers(i))).status);
  return statuses;
};

const allOk = (statuses: number[]) => statuses.every((s) => s === 200);

test("two clients behind one platform IP get separate budgets, and the one over its budget gets 429 with Retry-After", async () => {
  const as = (id: string) => () => ({ "x-real-ip": "10.0.0.1", "user-agent": "ChatGPT-User/1.0", "x-client-id": id });
  assert.ok(allOk(await burst(120, as("conversation-a"))));
  const over = await call(as("conversation-a")());
  assert.equal(over.status, 429);
  const wait = Number(over.headers.get("retry-after"));
  assert.ok(wait >= 1 && wait <= 60, `retry-after ${wait}`);
  assert.ok(allOk(await burst(120, as("conversation-b"))));
});

test("a known platform without a client id shares a larger budget per IP than an unknown caller", async () => {
  const claude = await burst(601, () => ({ "x-real-ip": "10.0.0.2", "user-agent": "Claude-User/1.0" }));
  assert.deepEqual([claude.filter((s) => s === 200).length, claude.at(-1)], [600, 429]);
  const unknown = await burst(121, () => ({ "x-real-ip": "10.0.0.3", "user-agent": "curl/8.5" }));
  assert.deepEqual([unknown.filter((s) => s === 200).length, unknown.at(-1)], [120, 429]);
});

test("the per-IP backstop stops a caller that rotates client ids", async () => {
  const rotating = await burst(1201, (i) => ({ "x-real-ip": "10.0.0.4", "x-client-id": `fake-${i}` }));
  assert.deepEqual([rotating.filter((s) => s === 200).length, rotating.at(-1)], [1200, 429]);
  assert.equal((await call({ "x-real-ip": "10.0.0.40", "x-client-id": "fake-0" })).status, 200);
});

test("initialize hands out an Mcp-Session-Id, and requests carrying it get their own budget", async () => {
  const mcp = (body: unknown, headers: Record<string, string>) =>
    POST(new Request("https://subletka.com/api/mcp", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }));
  const base = { "x-real-ip": "10.0.0.5", "user-agent": "curl/8.5" };
  const init = await mcp({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } }, base);
  const session = init.headers.get("mcp-session-id") ?? "";
  assert.match(session, /^[0-9a-f-]{36}$/);
  const list = { jsonrpc: "2.0", id: 2, method: "tools/list" };
  const withSession = [];
  for (let i = 0; i < 121; i++) withSession.push((await mcp(list, { ...base, "mcp-session-id": session })).status);
  assert.deepEqual([withSession.filter((s) => s === 200).length, withSession.at(-1)], [120, 429]);
  assert.equal((await mcp(list, base)).status, 200);
  assert.equal((await mcp(list, { ...base, "mcp-session-id": session })).headers.get("mcp-session-id"), null);
});

test("a rate-limit entry, and the IP in its key, is dropped from memory once its longest window has passed", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 0 });
  const take = limiter();
  take("post:203.0.113.7", 6, 60 * 60_000);
  take("contact:203.0.113.8", 40, 10 * 60_000);
  assert.equal(take.size(), 2);
  t.mock.timers.tick(60 * 60_000 - 1);
  take("api:198.51.100.1", 120, 60_000);
  assert.equal(take.size(), 3);
  t.mock.timers.tick(1);
  take("api:198.51.100.1", 120, 60_000);
  assert.equal(take.size(), 1);
});
