import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

const cacheControl = async (path: string, cookie?: string) => {
  const res = await proxy(new NextRequest(`http://localhost:3001${path}`, { headers: { host: "subletka.com", ...(cookie ? { cookie } : {}) } }));
  return res.headers.get("cache-control");
};

test("public pages revalidate without no-store so they can enter the back/forward cache", async () => {
  for (const path of ["/pl", "/en/warszawa", "/pl/krakow/rent", "/en/warszawa/mokotow", "/pl/about", "/en/saved", "/pl/nope"]) {
    assert.equal(await cacheControl(path), "private, no-cache", path);
  }
});

test("signed-in visitors and private pages keep Next's no-store", async () => {
  assert.equal(await cacheControl("/pl/warszawa", "subletka_session=x"), null);
  for (const path of ["/pl/post", "/en/me", "/en/me/abc", "/pl/manage/token"]) {
    assert.equal(await cacheControl(path), null, path);
  }
});
