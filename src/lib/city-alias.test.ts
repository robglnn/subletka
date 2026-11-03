import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { canonicalCityPath } from "@/lib/city-alias";
import { proxy } from "@/proxy";

const call = async (path: string, headers: Record<string, string> = {}) => {
  const res = await proxy(new NextRequest(`http://localhost:3001${path}`, { headers: { host: "subletka.com", ...headers } }));
  return { status: res.status, location: res.headers.get("location") };
};

test("English, foreign, inflected, accented and cased city names map to the city slug", () => {
  assert.equal(canonicalCityPath("/en/warsaw"), "/en/warszawa");
  assert.equal(canonicalCityPath("/pl/warsaw"), "/pl/warszawa");
  assert.equal(canonicalCityPath("/en/cracow"), "/en/krakow");
  assert.equal(canonicalCityPath("/en/Krak%C3%B3w"), "/en/krakow");
  assert.equal(canonicalCityPath("/pl/kraków"), "/pl/krakow");
  assert.equal(canonicalCityPath("/pl/Warszawa"), "/pl/warszawa");
  assert.equal(canonicalCityPath("/pl/warszawie"), "/pl/warszawa");
  assert.equal(canonicalCityPath("/en/krakau/rent"), "/en/krakow/rent");
  assert.equal(canonicalCityPath("/en/warsaw/mokotow"), "/en/warszawa/mokotow");
});

test("real slugs and other pages are left alone", () => {
  for (const path of ["/pl/warszawa", "/en/krakow/rent", "/pl/about", "/en/l/K95LxeEIZLaIiDyl", "/pl", "/en/gdansk", "/pl/%E0%A4%A"]) {
    assert.equal(canonicalCityPath(path), null, path);
  }
});

test("city aliases move permanently and keep the rest of the path and the query", async () => {
  assert.deepEqual(await call("/en/warsaw"), { status: 301, location: "http://localhost:3001/en/warszawa" });
  assert.deepEqual(await call("/en/cracow/rent?x=1"), { status: 301, location: "http://localhost:3001/en/krakow/rent?x=1" });
  assert.deepEqual(await call("/pl/Krak%C3%B3w?type=room"), { status: 301, location: "http://localhost:3001/pl/krakow?type=room" });
});

test("a city alias without a language goes to the chosen language and the real slug in one hop", async () => {
  const res = await call("/warsaw", { cookie: "lang=en" });
  assert.equal(res.status, 307);
  assert.equal(res.location, "http://localhost:3001/en/warszawa");
});
