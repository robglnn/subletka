import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { config, proxy } from "@/proxy";

const call = async (host: string, path: string, init: { method?: string; headers?: Record<string, string> } = {}) => {
  const res = await proxy(new NextRequest(`http://localhost:3001${path}`, { method: init.method, headers: { host, ...init.headers } }));
  return { status: res.status, location: res.headers.get("location"), passed: res.headers.get("x-middleware-next") === "1" };
};

const viaEdge = async (forwardedHost: string, path: string, method?: string) =>
  call("127.0.0.1:8080", path, { method, headers: { "x-forwarded-host": forwardedHost } });

const moved = (location: string) => ({ status: 301, location, passed: false });
const served = { status: 200, location: null, passed: true };
const RAILWAY = "web-production-xxxx.up.railway.app";

test("www and the Railway host move permanently to subletka.com with the same path and query", async () => {
  assert.deepEqual(await call("www.subletka.com", "/pl/warszawa?from=2026-11-01&max=4000"), moved("https://subletka.com/pl/warszawa?from=2026-11-01&max=4000"));
  assert.deepEqual(await call(RAILWAY, "/"), moved("https://subletka.com/"));
  assert.deepEqual(await call(RAILWAY, "/en/l/K95LxeEIZLaIiDyl"), moved("https://subletka.com/en/l/K95LxeEIZLaIiDyl"));
  assert.deepEqual(await call(`${RAILWAY}:443`, "/api/mcp", { method: "POST" }), moved("https://subletka.com/api/mcp"));
  assert.deepEqual(await call(RAILWAY, "/api/v1/listings?city=krakow&sort=price"), moved("https://subletka.com/api/v1/listings?city=krakow&sort=price"));
  assert.deepEqual(await call(RAILWAY, "/.well-known/mcp.json"), moved("https://subletka.com/.well-known/mcp.json"));
  assert.deepEqual(await call(RAILWAY, "/0123456789abcdef0123456789abcdef.txt"), moved("https://subletka.com/0123456789abcdef0123456789abcdef.txt"));
  assert.deepEqual(await call("subletka.com.example.net", "/pl"), moved("https://subletka.com/pl"));
});

test("the forwarded host from the edge decides, whatever host the container sees", async () => {
  assert.deepEqual(await viaEdge("subletka.com", "/pl/warszawa"), served);
  assert.deepEqual(await viaEdge(RAILWAY, "/api/mcp", "POST"), moved("https://subletka.com/api/mcp"));
  assert.deepEqual(await call("subletka.com", "/en/krakow", { headers: { "x-forwarded-host": "www.subletka.com" } }), moved("https://subletka.com/en/krakow"));
});

test("subletka.com and local hosts keep the language routing", async () => {
  assert.deepEqual(await call("subletka.com", "/pl/krakow"), served);
  assert.deepEqual(await call("SUBLETKA.COM:443", "/en"), served);
  assert.deepEqual(await call("127.0.0.1:3001", "/pl"), served);
  assert.deepEqual(await call("localhost:3917", "/saved", { headers: { "accept-language": "en-GB,en;q=0.9" } }), {
    status: 307,
    location: "http://localhost:3001/en/saved",
    passed: false,
  });
});

test("the matcher sends every non-locale path to the proxy exactly for the hosts it redirects", async () => {
  const [, byForwardedHost, byHost] = config.matcher;
  assert.ok(typeof byForwardedHost === "object" && typeof byHost === "object");
  const forwardedServed = new RegExp(`^${byForwardedHost.missing[0].value}$`);
  const hostServed = new RegExp(`^${byHost.missing[1].value}$`);
  const hosts = ["subletka.com", "www.subletka.com", RAILWAY, "localhost", "127.0.0.1", "subletka.com.example.net", "healthcheck.railway.app"];
  for (const host of hosts) {
    assert.equal(hostServed.test(host), (await call(host, "/pl")).passed, host);
    assert.equal(forwardedServed.test(host), (await viaEdge(host, "/pl")).passed, `forwarded ${host}`);
    assert.equal(forwardedServed.test(`${host}:3917`), (await viaEdge(`${host}:3917`, "/pl")).passed, `forwarded ${host}:3917`);
  }
});
