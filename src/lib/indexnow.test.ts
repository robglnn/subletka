import assert from "node:assert/strict";
import { test } from "node:test";
import { INDEXNOW_ENDPOINT, listingUrls, pingIndexNow } from "./indexnow";

const config = { site: "https://subletka.com", key: "abababababababababababababababab" };

const recorder = (respond: (call: number) => Response | Promise<Response>) => {
  const calls: { url: string; body: { host: string; key: string; keyLocation: string; urlList: string[] } }[] = [];
  const send = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    return respond(calls.length);
  }) as typeof fetch;
  return { calls, send };
};

test("listing urls cover both languages once per listing", () => {
  assert.deepEqual(listingUrls(config.site, ["abc", "a b", "abc"]), [
    "https://subletka.com/pl/l/abc",
    "https://subletka.com/en/l/abc",
    "https://subletka.com/pl/l/a%20b",
    "https://subletka.com/en/l/a%20b",
  ]);
});

test("urls are posted to IndexNow in batches of 10,000 with the host, key and key location", async () => {
  const { calls, send } = recorder(() => new Response(null, { status: 202 }));
  const urls = Array.from({ length: 10_001 }, (_, i) => `https://subletka.com/pl/l/${i}`);
  assert.deepEqual(await pingIndexNow(config, urls, send), { submitted: 10_001, failed: 0 });
  assert.deepEqual(
    calls.map((c) => [c.url, c.body.host, c.body.key, c.body.keyLocation, c.body.urlList.length]),
    [
      [INDEXNOW_ENDPOINT, "subletka.com", config.key, "https://subletka.com/abababababababababababababababab.txt", 10_000],
      [INDEXNOW_ENDPOINT, "subletka.com", config.key, "https://subletka.com/abababababababababababababababab.txt", 1],
    ],
  );
});

test("a failing or unreachable IndexNow is counted, never thrown", async () => {
  const { calls, send } = recorder((n) => (n === 1 ? new Response("bad", { status: 422 }) : Promise.reject(new TypeError("fetch failed"))));
  const urls = Array.from({ length: 10_005 }, (_, i) => `https://subletka.com/en/l/${i}`);
  assert.deepEqual(await pingIndexNow(config, urls, send), { submitted: 0, failed: 10_005 });
  assert.equal(calls.length, 2);
});

test("nothing is posted when nothing changed", async () => {
  const { calls, send } = recorder(() => new Response(null, { status: 200 }));
  assert.deepEqual(await pingIndexNow(config, [], send), { submitted: 0, failed: 0 });
  assert.equal(calls.length, 0);
});
