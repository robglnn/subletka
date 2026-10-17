import assert from "node:assert/strict";
import { test } from "node:test";
import { hubPaths, hubStamps, hubUrls } from "./hubs";

const row = { city: "krakow" as const, district: "Stare Miasto", lat: null, lng: null };

test("a listing change touches the home page, its city, the city's rent page and its district", () => {
  assert.deepEqual(hubPaths([row, row, { ...row, district: null }]), ["", "/krakow", "/krakow/rent", "/krakow/stare-miasto"]);
});

test("hub URLs exist in both languages", () => {
  assert.deepEqual(hubUrls("https://subletka.com", ["/krakow/rent"]), ["https://subletka.com/pl/krakow/rent", "https://subletka.com/en/krakow/rent"]);
});

test("each hub is stamped with the newest change among its listings", () => {
  const old = new Date("2026-10-01T00:00:00Z");
  const fresh = new Date("2026-10-16T00:00:00Z");
  const stamps = hubStamps([
    { ...row, updatedAt: fresh },
    { ...row, district: "Podgórze", updatedAt: old },
    { city: "warszawa", district: null, lat: null, lng: null, updatedAt: old },
  ]);
  assert.equal(stamps.get(""), fresh);
  assert.equal(stamps.get("/krakow/rent"), fresh);
  assert.equal(stamps.get("/krakow/stare-miasto"), fresh);
  assert.equal(stamps.get("/krakow/podgorze"), old);
  assert.equal(stamps.get("/warszawa"), old);
  assert.equal(stamps.get("/warszawa/mokotow"), undefined);
});
